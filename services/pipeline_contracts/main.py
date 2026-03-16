import asyncio
import aiohttp
import os
import sys
from datetime import datetime, timezone, timedelta
from sqlalchemy import select

# Add to sys.path to run standalone
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from packages.db.session import async_session
from packages.db.models import Account, CompanyAlias, Signal
from packages.matching.utils import normalize_company_name, fuzzy_match_company
from packages.matching.signal_gates import load_enabled_gates, signal_passes_gates

# USASpending.gov API — free, no key required
# Searches for recent construction contract awards using NAICS codes
USASPENDING_BASE = "https://api.usaspending.gov/api/v2/search/spending_by_award/"

# Construction NAICS — API requires 2, 4, or 6-digit codes
# "23" covers all construction: 236 (Building), 237 (Heavy/Civil), 238 (Specialty Trade)
CONSTRUCTION_NAICS = ["23"]

MOCK_CONTRACT_DATA = [
    {
        "id": "CONT_W912DY23C0045",
        "award_id": "W912DY-23-C-0045",
        "contractor_name": "Hensel Phelps Construction Co",
        "description": "Military housing renovation - Fort Bragg",
        "naics_code": "236220",
        "award_amount": 45000000.0,
        "start_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "awarding_agency": "Department of Defense",
        "place_city": "Fayetteville",
        "place_state": "NC",
    },
    {
        "id": "CONT_GS11P21MKC0087",
        "award_id": "GS-11P-21-MKC-0087",
        "contractor_name": "Clark Construction Group LLC",
        "description": "Federal courthouse expansion and modernization",
        "naics_code": "236220",
        "award_amount": 92000000.0,
        "start_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "awarding_agency": "General Services Administration",
        "place_city": "Washington",
        "place_state": "DC",
    },
    {
        "id": "CONT_DTFH6116C00032",
        "award_id": "DTFH61-16-C-00032",
        "contractor_name": "Kiewit Infrastructure Co",
        "description": "Interstate bridge replacement project",
        "naics_code": "237310",
        "award_amount": 158000000.0,
        "start_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "awarding_agency": "Department of Transportation",
        "place_city": "Louisville",
        "place_state": "KY",
    },
]


async def fetch_from_usaspending() -> list[dict]:
    """Fetch federal construction contract awards from USASpending.gov."""
    all_records = []
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")

    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=60)) as session:
        for prefix in CONSTRUCTION_NAICS:
            try:
                payload = {
                    "filters": {
                        "time_period": [
                            {
                                "start_date": cutoff,
                                "end_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                            }
                        ],
                        "award_type_codes": ["A", "B", "C", "D"],  # Contracts only
                        "naics_codes": {"require": [prefix]},
                    },
                    "fields": [
                        "Award ID",
                        "Recipient Name",
                        "Description",
                        "NAICS Code",
                        "Award Amount",
                        "Start Date",
                        "Awarding Agency",
                        "Place of Performance City Code",
                        "Place of Performance State Code",
                        "generated_internal_id",
                    ],
                    "limit": 100,
                    "page": 1,
                    "sort": "Award Amount",
                    "order": "desc",
                }

                async with session.post(USASPENDING_BASE, json=payload) as resp:
                    if resp.status != 200:
                        print(f"  USASpending API {resp.status} for NAICS {prefix}")
                        continue
                    data = await resp.json()
                    results = data.get("results", [])
                    if not results:
                        continue

                    for row in results:
                        contractor = (row.get("Recipient Name") or "").strip()
                        if not contractor:
                            continue

                        amount = 0.0
                        try:
                            amount = float(row.get("Award Amount") or 0)
                        except (ValueError, TypeError):
                            pass

                        internal_id = row.get("generated_internal_id", row.get("Award ID", ""))
                        all_records.append({
                            "id": f"usaspend_{internal_id}",
                            "award_id": row.get("Award ID", ""),
                            "contractor_name": contractor,
                            "description": (row.get("Description") or "")[:500],
                            "naics_code": row.get("NAICS Code", ""),
                            "award_amount": amount,
                            "start_date": row.get("Start Date", ""),
                            "awarding_agency": row.get("Awarding Agency", ""),
                            "place_city": row.get("Place of Performance City Code", ""),
                            "place_state": row.get("Place of Performance State Code", ""),
                        })

                    print(f"  NAICS {prefix}: {len(results)} contracts fetched")

            except Exception as e:
                print(f"  USASpending API error for NAICS {prefix}: {e}")

    return all_records


async def fetch_contract_data():
    print(f"[{datetime.now().isoformat()}] Starting federal contract data fetch...")

    # Try real API first, fall back to mock
    records = await fetch_from_usaspending()
    if records:
        print(f"  Fetched {len(records)} total contract records")
    else:
        print("  USASpending API unavailable — using mock data")
        records = MOCK_CONTRACT_DATA

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
            company_name = record["contractor_name"]
            norm_name = normalize_company_name(company_name)

            # Simple matching
            matched_id = existing_aliases.get(norm_name)
            if not matched_id and norm_name in existing_accounts:
                matched_id = existing_accounts[norm_name]

            if not matched_id:
                matched_id, score, match_category = fuzzy_match_company(norm_name, existing_accounts)
                if match_category in ['manual_review', 'no_match']:
                    city = record.get("place_city", "")
                    state = record.get("place_state", "")
                    new_acc = Account(
                        name=company_name,
                        name_normalized=norm_name,
                        tier=0,
                        hq_city=city if city else None,
                        hq_state=state if state else None,
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
                    select(Signal).where(Signal.external_id == record["id"])
                )
                if dup_check.scalars().first():
                    continue

                # Gate check — skip signals that don't match any enabled gate
                acct_info = account_details.get(str(matched_id), {})
                if not signal_passes_gates(
                    gates,
                    location_state=record.get("place_state"),
                    source="usaspending",
                    project_value=record["award_amount"],
                    account_segment=acct_info.get("segment"),
                    account_employee_count=acct_info.get("employee_count"),
                ):
                    records_gated += 1
                    continue

                # Score based on contract value and agency
                pts = 0
                heat = "cool"
                amount = record["award_amount"]

                desc_short = (record.get("description") or "")[:60]
                if amount >= 100000000:
                    pts += 50
                    heat = "hot"
                    title = f"Mega Contract: {desc_short}" if desc_short else "Mega Federal Contract Award"
                elif amount >= 50000000:
                    pts += 35
                    heat = "hot"
                    title = f"Major Contract: {desc_short}" if desc_short else "Major Federal Contract Award"
                elif amount >= 10000000:
                    pts += 25
                    heat = "warm"
                    title = f"Contract Award: {desc_short}" if desc_short else "Federal Contract Award"
                elif amount >= 1000000:
                    pts += 15
                    heat = "warm"
                    title = f"Contract Award: {desc_short}" if desc_short else "Federal Contract Award"
                else:
                    pts += 5
                    title = f"Small Contract: {desc_short}" if desc_short else "Small Federal Contract"

                # Bonus for DOD/infrastructure (high-value follow-on work)
                agency = (record.get("awarding_agency") or "").lower()
                if "defense" in agency or "army" in agency or "navy" in agency:
                    pts += 10
                elif "transportation" in agency or "energy" in agency:
                    pts += 5

                amount_str = f"${amount:,.0f}" if amount else "N/A"
                detail = (
                    f"{record.get('description', '')[:200]} | "
                    f"Amount: {amount_str} | "
                    f"Agency: {record.get('awarding_agency', 'Unknown')}"
                )

                # Parse source date
                source_date = None
                try:
                    sd = record.get("start_date") or record.get("award_date")
                    if sd:
                        source_date = datetime.fromisoformat(str(sd).replace("Z", "+00:00")) if "T" in str(sd) else datetime.strptime(str(sd)[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                except (ValueError, TypeError):
                    pass

                agency = record.get("awarding_agency", "Unknown")
                award_id = record.get("award_id", "")
                contractor = record.get("contractor_name", "")
                place = f"{record.get('place_city', '')}, {record.get('place_state', '')}".strip(", ")

                detail_parts = []
                desc = (record.get("description") or "")[:250]
                if desc:
                    detail_parts.append(desc)
                detail_parts.append(f"Award: {amount_str}")
                detail_parts.append(f"Agency: {agency}")
                if contractor:
                    detail_parts.append(f"Contractor: {contractor}")
                if place:
                    detail_parts.append(place)
                if record.get("naics_code"):
                    detail_parts.append(f"NAICS: {record['naics_code']}")
                detail = " | ".join(detail_parts)

                # USASpending award page
                source_url = f"https://www.usaspending.gov/search/?hash=&filters=keyword_{award_id}" if award_id else None

                new_signal = Signal(
                    account_id=matched_id,
                    source="usaspending",
                    signal_type="contract_award",
                    heat=heat,
                    title=title,
                    detail=detail,
                    raw_data=record,
                    score_contribution=pts,
                    external_id=record["id"],
                    project_name=record.get("description", "")[:100],
                    project_value=amount,
                    location_city=record.get("place_city"),
                    location_state=record.get("place_state"),
                    source_url=source_url,
                    source_date=source_date,
                )
                db.add(new_signal)
                records_scored += 1

        await db.commit()

    print(f"[{datetime.now().isoformat()}] Federal contracts pipeline complete.")
    print(f"records_fetched={records_fetched} records_matched={records_matched} records_gated={records_gated} records_scored={records_scored}")

if __name__ == "__main__":
    asyncio.run(fetch_contract_data())
