import asyncio
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
from packages.integrations.procore import ProcoreClient

# Procore stage names mapped to our internal stages
PROCORE_STAGE_MAP = {
    "Bidding": "Bidding",
    "Pre-Construction": "Pre-Construction",
    "Active": "Active",
    "Course of Construction": "Active",
    "Warranty": "Warranty",
}

MOCK_PROCORE_DATA = [
    {
        "id": 8392104,
        "project_name": "Austin Metro Transit Expansion",
        "company_name": "Austin Commercial",
        "stage": "Bidding",
        "estimated_value": 75000000.0,
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "location": "Austin, TX",
    },
    {
        "id": 9923145,
        "project_name": "Skyline High-Rise Condos",
        "company_name": "Turner Construction Company",
        "stage": "Pre-Construction",
        "estimated_value": 120000000.0,
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "location": "Chicago, IL",
    },
]


async def fetch_from_procore_api() -> list[dict]:
    """Fetch real project data from Procore API, mapped to our record format."""
    client = ProcoreClient()
    if not client.is_configured:
        return []

    projects = await client.get_projects()
    records = []
    for p in projects:
        # Extract location from address fields
        city = p.get("city", "") or ""
        state = p.get("state_code", "") or ""
        location = f"{city}, {state}" if city and state else city or state or ""

        stage = PROCORE_STAGE_MAP.get(p.get("stage", ""), p.get("stage", ""))

        records.append({
            "id": p.get("id"),
            "project_name": p.get("name", ""),
            "company_name": p.get("company", {}).get("name", "") if isinstance(p.get("company"), dict) else "",
            "stage": stage,
            "estimated_value": float(p.get("estimated_value", 0) or 0),
            "created_at": p.get("created_at", datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")),
            "location": location,
        })
    return records


async def fetch_procore_data():
    print(f"[{datetime.now().isoformat()}] Starting Procore data fetch...")

    # Try real API first, fall back to mock
    records = await fetch_from_procore_api()
    if records:
        print(f"  Fetched {len(records)} projects from Procore API")
    else:
        print("  Procore not configured or unavailable — using mock data")
        records = MOCK_PROCORE_DATA

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
            company_name = record["company_name"]
            norm_name = normalize_company_name(company_name)
            
            # Simple matching
            matched_id = existing_aliases.get(norm_name)
            if not matched_id and norm_name in existing_accounts:
                matched_id = existing_accounts[norm_name]
                
            if not matched_id:
                matched_id, score, match_category = fuzzy_match_company(norm_name, existing_accounts)
                if match_category in ['manual_review', 'no_match']:
                    # If it's a completely new GC from Procore, we could create an account.
                    # For this demo, we'll auto-create if no match for demonstration of "net new inbound".
                    new_acc = Account(
                        name=company_name,
                        name_normalized=norm_name,
                        tier=0,  # Discovered — not yet promoted
                        hq_city=record["location"].split(",")[0].strip() if "," in record["location"] else None,
                        hq_state=record["location"].split(",")[1].strip() if "," in record["location"] else None,
                    )
                    db.add(new_acc)
                    await db.flush() # get ID
                    matched_id = new_acc.id
                    existing_accounts[norm_name] = str(new_acc.id)
            
            if matched_id:
                records_matched += 1
                
                # Check for existing signal
                dup_check = await db.execute(
                    select(Signal).where(Signal.external_id == f"procore_{record['id']}")
                )
                if dup_check.scalars().first():
                    continue # Already processed

                # Gate check — skip signals that don't match any enabled gate
                loc = record.get("location", "")
                loc_state = loc.split(",")[1].strip() if "," in loc else None
                acct_info = account_details.get(str(matched_id), {})
                if not signal_passes_gates(
                    gates,
                    location_state=loc_state,
                    source="procore",
                    project_value=record["estimated_value"],
                    account_segment=acct_info.get("segment"),
                    account_employee_count=acct_info.get("employee_count"),
                ):
                    records_gated += 1
                    continue

                # Calculate score
                pts = 0
                heat = "cool"
                title = f"Procore: {record['stage']}"
                
                if record["stage"] == "Bidding":
                    pts += 40
                    heat = "hot"
                    title = "Procore: Active Bidding"
                elif record["stage"] == "Pre-Construction":
                    pts += 50
                    heat = "hot"
                    title = "Procore: Pre-Construction Award"
                    
                if record["estimated_value"] >= 100000000:
                    pts += 20 # Mega project bump
                elif record["estimated_value"] >= 50000000:
                    pts += 10
                    
                # Parse source date
                source_date = None
                try:
                    ca = record.get("created_at")
                    if ca:
                        source_date = datetime.fromisoformat(str(ca).replace("Z", "+00:00")) if "T" in str(ca) else datetime.strptime(str(ca)[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                except (ValueError, TypeError):
                    pass

                loc = record.get("location", "")
                value_str = f"${record['estimated_value']:,.0f}"
                detail = f"Project: {record['project_name']} | {loc} | Est. Value: {value_str}"

                new_signal = Signal(
                    account_id=matched_id,
                    source="procore",
                    signal_type="project_award",
                    heat=heat,
                    title=title,
                    detail=detail,
                    raw_data=record,
                    score_contribution=pts,
                    external_id=f"procore_{record['id']}",
                    location_city=loc.split(",")[0].strip() if "," in loc else None,
                    location_state=loc.split(",")[1].strip() if "," in loc else None,
                    source_date=source_date,
                )
                db.add(new_signal)
                records_scored += 1
                
        await db.commit()
    
    print(f"[{datetime.now().isoformat()}] Procore pipeline complete.")
    print(f"records_fetched={records_fetched} records_matched={records_matched} records_gated={records_gated} records_scored={records_scored}")

if __name__ == "__main__":
    asyncio.run(fetch_procore_data())
