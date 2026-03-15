import asyncio
import aiohttp
import os
import sys
from datetime import datetime, timezone, timedelta
from sqlalchemy import select

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from packages.db.session import async_session
from packages.db.models import Account, Signal
from packages.matching.signal_gates import load_enabled_gates, signal_passes_gates

# FEMA Open API — free, no key required
FEMA_BASE = "https://www.fema.gov/api/open/v2/DisasterDeclarations"

# State abbreviation to name for display
STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
    "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
    "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia",
}

MOCK_FEMA_DATA = [
    {
        "id": "FEMA-DR-4856",
        "disaster_number": 4856,
        "state": "FL",
        "declaration_type": "DR",
        "title": "Hurricane Milton",
        "declaration_date": datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00.000Z"),
        "designated_area": "Hillsborough County",
        "incident_type": "Hurricane",
    },
    {
        "id": "FEMA-DR-4849",
        "disaster_number": 4849,
        "state": "CA",
        "declaration_type": "DR",
        "title": "Wildfires",
        "declaration_date": datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00.000Z"),
        "designated_area": "Los Angeles County",
        "incident_type": "Fire",
    },
    {
        "id": "FEMA-DR-4841",
        "disaster_number": 4841,
        "state": "TX",
        "declaration_type": "DR",
        "title": "Severe Storms and Flooding",
        "declaration_date": datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00.000Z"),
        "designated_area": "Harris County",
        "incident_type": "Flood",
    },
]


async def fetch_from_fema() -> list[dict]:
    """Fetch recent FEMA disaster declarations."""
    all_records = []
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m-%dT00:00:00.000Z")

    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
        try:
            # Only Major Disaster Declarations (DR) and Emergency Declarations (EM)
            # that drive construction demand
            params = {
                "$filter": f"declarationDate ge '{cutoff}' and (declarationType eq 'DR' or declarationType eq 'EM')",
                "$orderby": "declarationDate desc",
                "$top": 100,
            }

            async with session.get(FEMA_BASE, params=params) as resp:
                if resp.status != 200:
                    print(f"  FEMA API {resp.status}")
                    return []
                data = await resp.json()
                declarations = data.get("DisasterDeclarations", [])

                # Deduplicate by disaster number (one per state, not per county)
                seen_disasters: set[str] = set()
                for dec in declarations:
                    disaster_key = f"{dec.get('disasterNumber', '')}_{dec.get('state', '')}"
                    if disaster_key in seen_disasters:
                        continue
                    seen_disasters.add(disaster_key)

                    state = dec.get("state", "")
                    all_records.append({
                        "id": f"fema_{dec.get('disasterNumber', '')}_{state}",
                        "disaster_number": dec.get("disasterNumber", 0),
                        "state": state,
                        "declaration_type": dec.get("declarationType", ""),
                        "title": dec.get("declarationTitle", ""),
                        "declaration_date": dec.get("declarationDate", ""),
                        "designated_area": dec.get("designatedArea", ""),
                        "incident_type": dec.get("incidentType", ""),
                    })

                print(f"  FEMA: {len(all_records)} unique disaster declarations fetched")

        except Exception as e:
            print(f"  FEMA API error: {e}")

    return all_records


async def fetch_fema_data():
    print(f"[{datetime.now().isoformat()}] Starting FEMA disaster declarations fetch...")

    records = await fetch_from_fema()
    if records:
        print(f"  Fetched {len(records)} disaster declarations")
    else:
        print("  FEMA API unavailable — using mock data")
        records = MOCK_FEMA_DATA

    async with async_session() as db:
        gates = await load_enabled_gates(db)

        # Load accounts grouped by state
        result = await db.execute(
            select(Account.id, Account.hq_state, Account.segment, Account.employee_count)
            .where(Account.hq_state.isnot(None))
        )
        state_accounts: dict[str, list[dict]] = {}
        for row in result.all():
            state_accounts.setdefault(row.hq_state, []).append({
                "id": str(row.id),
                "segment": row.segment,
                "employee_count": row.employee_count,
            })

        records_fetched = len(records)
        records_matched = 0
        records_scored = 0
        records_gated = 0

        for record in records:
            disaster_state = record.get("state", "")
            target_accounts = state_accounts.get(disaster_state, [])
            if not target_accounts:
                continue

            for acct in target_accounts:
                ext_id = f"{record['id']}_{acct['id']}"

                # Dedup
                dup_check = await db.execute(
                    select(Signal).where(Signal.external_id == ext_id)
                )
                if dup_check.scalars().first():
                    continue

                # Gate check
                if not signal_passes_gates(
                    gates,
                    location_state=disaster_state,
                    source="fema",
                    account_segment=acct.get("segment"),
                    account_employee_count=acct.get("employee_count"),
                ):
                    records_gated += 1
                    continue

                records_matched += 1

                # Score based on disaster type and severity
                incident = (record.get("incident_type") or "").lower()
                dec_type = record.get("declaration_type", "")

                if dec_type == "DR":
                    pts = 25
                    heat = "hot"
                else:
                    pts = 15
                    heat = "warm"

                # Certain disaster types = higher construction demand
                if incident in ("hurricane", "tornado", "earthquake"):
                    pts += 15
                    title = f"Major Disaster: {record.get('title', 'Unknown')} — Construction Demand Expected"
                elif incident in ("flood", "severe storm", "fire"):
                    pts += 10
                    title = f"Disaster Declaration: {record.get('title', 'Unknown')} — Rebuild Opportunity"
                else:
                    title = f"FEMA Disaster: {record.get('title', 'Unknown')}"

                state_name = STATE_NAMES.get(disaster_state, disaster_state)
                area = record.get("designated_area", "")
                detail = (
                    f"FEMA Disaster #{record.get('disaster_number', '')} — {record.get('incident_type', 'Unknown')} | "
                    f"{state_name}" + (f", {area}" if area else "") +
                    f" | Declared: {record.get('declaration_date', '')[:10]}"
                )

                source_date = None
                try:
                    dd = record.get("declaration_date", "")
                    if dd:
                        source_date = datetime.fromisoformat(dd.replace("Z", "+00:00").replace(".000Z", "+00:00"))
                except (ValueError, TypeError):
                    pass

                new_signal = Signal(
                    account_id=acct["id"],
                    source="fema",
                    signal_type="disaster_declaration",
                    heat=heat,
                    title=title,
                    detail=detail,
                    raw_data=record,
                    score_contribution=pts,
                    external_id=ext_id,
                    project_name=record.get("title", "")[:100],
                    location_state=disaster_state,
                    source_date=source_date,
                )
                db.add(new_signal)
                records_scored += 1

        await db.commit()

    print(f"[{datetime.now().isoformat()}] FEMA pipeline complete.")
    print(f"records_fetched={records_fetched} records_matched={records_matched} records_gated={records_gated} records_scored={records_scored}")

if __name__ == "__main__":
    asyncio.run(fetch_fema_data())
