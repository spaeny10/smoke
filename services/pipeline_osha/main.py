import asyncio
import aiohttp
import json
import os
import sys
from datetime import datetime, timezone
from sqlalchemy import select

# Add to sys.path to run standalone
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from packages.db.session import async_session
from packages.db.models import Account, CompanyAlias, Signal
from packages.matching.utils import normalize_company_name, fuzzy_match_company
from packages.matching.signal_gates import load_enabled_gates, signal_passes_gates

DOL_API_KEY = os.environ.get("DOL_API_KEY")
DOL_API_BASE = "https://data.dol.gov/get/inspection"

# Construction NAICS prefixes: 236=Building, 237=Heavy/Civil, 238=Specialty Trade
CONSTRUCTION_NAICS = ["236", "237", "238"]

MOCK_OSHA_DATA = [
    {
        "activity_nr": "123456789",
        "estab_name": "Turner Construction Company LLC",
        "site_city": "New York",
        "site_state": "NY",
        "open_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "insp_type": "Accident",
        "violation_type": "Serious",
        "total_current_penalty": 15000.0,
        "nr_violations": 2,
    },
    {
        "activity_nr": "987654321",
        "estab_name": "DPR Construction",
        "site_city": "Redwood City",
        "site_state": "CA",
        "open_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "insp_type": "Planned",
        "violation_type": "",
        "total_current_penalty": 0.0,
        "nr_violations": 0,
    },
]


async def fetch_from_dol_api() -> list[dict]:
    """Fetch real OSHA inspection data from data.dol.gov API."""
    if not DOL_API_KEY:
        return []

    headers = {"X-API-KEY": DOL_API_KEY}
    all_records = []

    async with aiohttp.ClientSession() as session:
        for prefix in CONSTRUCTION_NAICS:
            offset = 0
            while True:
                params = {
                    "limit": 200,
                    "offset": offset,
                    "filter_object": json.dumps({
                        "field": "naics_code",
                        "operator": "gt",
                        "value": f"{prefix}000",
                    }),
                }
                try:
                    async with session.get(
                        DOL_API_BASE, headers=headers, params=params, timeout=aiohttp.ClientTimeout(total=30)
                    ) as resp:
                        if resp.status != 200:
                            print(f"  DOL API returned {resp.status} for NAICS {prefix}, offset {offset}")
                            break
                        data = await resp.json()
                        if not data:
                            break

                        # Filter to only records within this NAICS prefix range
                        for row in data:
                            naics = str(row.get("naics_code", ""))
                            if naics.startswith(prefix):
                                all_records.append({
                                    "activity_nr": str(row.get("activity_nr", "")),
                                    "estab_name": row.get("estab_name", ""),
                                    "site_city": row.get("site_city", ""),
                                    "site_state": row.get("site_state", ""),
                                    "open_date": row.get("open_date", ""),
                                    "insp_type": row.get("insp_type", ""),
                                    "violation_type": row.get("viol_type_text", ""),
                                    "total_current_penalty": float(row.get("total_current_penalty", 0) or 0),
                                    "nr_violations": int(row.get("total_violations", 0) or 0),
                                })

                        if len(data) < 200:
                            break
                        offset += 200
                except Exception as e:
                    print(f"  DOL API error for NAICS {prefix}: {e}")
                    break

    return all_records


async def fetch_osha_data():
    print(f"[{datetime.now().isoformat()}] Starting OSHA data fetch...")

    # Try real API first, fall back to mock
    records = await fetch_from_dol_api()
    if records:
        print(f"  Fetched {len(records)} records from DOL API")
    else:
        print("  DOL_API_KEY not set or API unavailable — using mock data")
        records = MOCK_OSHA_DATA

    async with async_session() as db:
        # Load signal gates for filtering
        gates = await load_enabled_gates(db)

        # Load accounts for matching
        result = await db.execute(select(Account.id, Account.name_normalized, Account.segment, Account.employee_count))
        rows = result.all()
        existing_accounts = {row.name_normalized: str(row.id) for row in rows}
        account_details = {str(row.id): {"segment": row.segment, "employee_count": row.employee_count} for row in rows}

        alias_result = await db.execute(select(CompanyAlias.alias, CompanyAlias.account_id))
        existing_aliases = {row.alias: str(row.account_id) for row in alias_result.all()}

        records_fetched = len(records)
        records_matched = 0
        records_scored = 0
        records_gated = 0

        for record in records:
            company_name = record["estab_name"]
            norm_name = normalize_company_name(company_name)
            
            # Simple matching
            matched_id = existing_aliases.get(norm_name)
            if not matched_id and norm_name in existing_accounts:
                matched_id = existing_accounts[norm_name]
                
            if not matched_id:
                matched_id, score, match_category = fuzzy_match_company(norm_name, existing_accounts)
                if match_category in ['manual_review', 'no_match']:
                    # Auto-create a tier=0 "Discovered" account so the signal is never lost
                    new_acc = Account(
                        name=company_name,
                        name_normalized=norm_name,
                        tier=0,
                        hq_city=record["site_city"],
                        hq_state=record["site_state"],
                    )
                    db.add(new_acc)
                    await db.flush()
                    matched_id = new_acc.id
                    existing_accounts[norm_name] = str(new_acc.id)
                    account_details[str(new_acc.id)] = {"segment": None, "employee_count": None}

            if matched_id:
                records_matched += 1

                # Check for existing signal
                dup_check = await db.execute(
                    select(Signal).where(Signal.external_id == record["activity_nr"])
                )
                if dup_check.scalars().first():
                    continue # Already processed

                # Gate check — skip signals that don't match any enabled gate
                acct_info = account_details.get(str(matched_id), {})
                if not signal_passes_gates(
                    gates,
                    location_state=record["site_state"],
                    source="osha",
                    account_segment=acct_info.get("segment"),
                    account_employee_count=acct_info.get("employee_count"),
                ):
                    records_gated += 1
                    continue

                # Calculate score
                pts = 0
                heat = "cool"
                title = f"OSHA Inspection: {record['insp_type']}"
                
                if record["insp_type"] == "Accident":
                    pts += 25
                    heat = "hot"
                    title = "Accident-Triggered OSHA Inspection"
                elif "Repeat" in record["violation_type"] or "Willful" in record["violation_type"]:
                    pts += 30
                    heat = "hot"
                    title = "Repeat/Willful OSHA Violation"
                elif "Serious" in record["violation_type"]:
                    pts += 20
                    heat = "warm"
                    title = "Serious OSHA Citation"
                else:
                    pts += 5
                    
                if record["total_current_penalty"] >= 50000:
                    pts += 15
                    
                # Parse source date
                source_date = None
                try:
                    if record.get("open_date"):
                        source_date = datetime.strptime(str(record["open_date"])[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                except (ValueError, TypeError):
                    pass

                insp_type = record.get("insp_type", "")
                penalty = record["total_current_penalty"]
                violations = record["nr_violations"]
                site = f"{record['site_city']}, {record['site_state']}"
                detail = f"{insp_type} inspection | {violations} violation{'s' if violations != 1 else ''}, penalty ${penalty:,.0f} | {site}"

                new_signal = Signal(
                    account_id=matched_id,
                    source="osha",
                    signal_type="inspection",
                    heat=heat,
                    title=title,
                    detail=detail,
                    raw_data=record,
                    score_contribution=pts,
                    external_id=record["activity_nr"],
                    location_city=record["site_city"],
                    location_state=record["site_state"],
                    source_date=source_date,
                )
                db.add(new_signal)
                records_scored += 1
                
        await db.commit()
    
    print(f"[{datetime.now().isoformat()}] OSHA pipeline complete.")
    print(f"records_fetched={records_fetched} records_matched={records_matched} records_gated={records_gated} records_scored={records_scored}")

if __name__ == "__main__":
    asyncio.run(fetch_osha_data())
