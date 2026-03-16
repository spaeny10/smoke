import asyncio
import aiohttp
import os
import sys
from datetime import datetime, timezone, timedelta
from sqlalchemy import select

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from packages.db.session import async_session
from packages.db.models import Account, CompanyAlias, Signal
from packages.matching.utils import normalize_company_name, fuzzy_match_company
from packages.matching.signal_gates import load_enabled_gates, signal_passes_gates

# SAM.gov Opportunities API — free key from api.data.gov
SAM_BASE = "https://api.sam.gov/opportunities/v2/search"

MOCK_SAM_DATA = [
    {
        "id": "SAM-OPP-2026-001",
        "notice_id": "W912DY26R0088",
        "title": "Design-Build: Barracks Renovation, Fort Liberty",
        "description": "Full renovation of 4 barracks buildings including MEP, structural, and site work.",
        "naics_code": "236220",
        "organization": "US Army Corps of Engineers",
        "city": "Fayetteville",
        "state": "NC",
        "posted_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "response_deadline": (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d"),
        "type": "solicitation",
        "set_aside": "Total Small Business Set-Aside",
    },
    {
        "id": "SAM-OPP-2026-002",
        "notice_id": "GS11P26MKC0045",
        "title": "Federal Courthouse New Construction — Phoenix, AZ",
        "description": "New 12-story federal courthouse, 350,000 SF, LEED Gold target.",
        "naics_code": "236220",
        "organization": "General Services Administration",
        "city": "Phoenix",
        "state": "AZ",
        "posted_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "response_deadline": (datetime.now(timezone.utc) + timedelta(days=45)).strftime("%Y-%m-%d"),
        "type": "presolicitation",
        "set_aside": None,
    },
    {
        "id": "SAM-OPP-2026-003",
        "notice_id": "DTFH6126R00015",
        "title": "I-95 Bridge Deck Replacement — Phase 2",
        "description": "Replace bridge decks on 3 overpasses along I-95 corridor.",
        "naics_code": "237310",
        "organization": "Federal Highway Administration",
        "city": "Richmond",
        "state": "VA",
        "posted_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "response_deadline": (datetime.now(timezone.utc) + timedelta(days=21)).strftime("%Y-%m-%d"),
        "type": "solicitation",
        "set_aside": None,
    },
]


async def fetch_from_sam() -> list[dict]:
    """Fetch federal construction opportunities from SAM.gov."""
    api_key = os.environ.get("SAM_API_KEY")
    if not api_key:
        return []

    all_records = []
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%m/%d/%Y")
    today = datetime.now(timezone.utc).strftime("%m/%d/%Y")

    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=60)) as session:
        try:
            params = {
                "api_key": api_key,
                "limit": 100,
                "postedFrom": cutoff,
                "postedTo": today,
                "ncode": "236220,237310,237990,238",  # Construction NAICS
                "ptype": "o,p,k",  # solicitations, presolicitations, combined synopsis
            }

            async with session.get(SAM_BASE, params=params) as resp:
                if resp.status != 200:
                    print(f"  SAM.gov API {resp.status}")
                    return []
                data = await resp.json()
                opportunities = data.get("opportunitiesData", [])

                for opp in opportunities:
                    pop = opp.get("placeOfPerformance", {})
                    state_info = pop.get("state", {})
                    city_info = pop.get("city", {})

                    all_records.append({
                        "id": f"sam_{opp.get('noticeId', '')}",
                        "notice_id": opp.get("noticeId", ""),
                        "title": (opp.get("title") or "")[:200],
                        "description": (opp.get("description") or "")[:500],
                        "naics_code": opp.get("naicsCode", ""),
                        "organization": opp.get("fullParentPathName", opp.get("organizationName", "")),
                        "city": city_info.get("name", "") if isinstance(city_info, dict) else str(city_info),
                        "state": state_info.get("code", "") if isinstance(state_info, dict) else str(state_info),
                        "posted_date": opp.get("postedDate", ""),
                        "response_deadline": opp.get("responseDeadLine", ""),
                        "type": opp.get("type", ""),
                        "set_aside": opp.get("typeOfSetAside", ""),
                    })

                print(f"  SAM.gov: {len(opportunities)} opportunities fetched")

        except Exception as e:
            print(f"  SAM.gov API error: {e}")

    return all_records


async def fetch_sam_data():
    print(f"[{datetime.now().isoformat()}] Starting SAM.gov opportunities fetch...")

    records = await fetch_from_sam()
    if records:
        print(f"  Fetched {len(records)} total SAM opportunities")
    else:
        print("  SAM.gov API unavailable — using mock data")
        records = MOCK_SAM_DATA

    async with async_session() as db:
        gates = await load_enabled_gates(db)

        result = await db.execute(select(Account.id, Account.name_normalized, Account.segment, Account.employee_count))
        rows = result.all()
        existing_accounts = {row.name_normalized: str(row.id) for row in rows}
        account_details = {str(row.id): {"segment": row.segment, "employee_count": row.employee_count} for row in rows}

        # For SAM opportunities, match to accounts in the same state (HQ + branches)
        from packages.matching.utils import build_state_account_index
        state_accounts_raw = await build_state_account_index(db)
        state_accounts: dict[str, list[str]] = {}
        for state, acct_list in state_accounts_raw.items():
            state_accounts[state] = [a["id"] for a in acct_list]

        records_fetched = len(records)
        records_matched = 0
        records_scored = 0
        records_gated = 0

        for record in records:
            # Dedup by external_id
            dup_check = await db.execute(
                select(Signal).where(Signal.external_id == record["id"])
            )
            if dup_check.scalars().first():
                continue

            # Match to accounts in the same state as the opportunity
            opp_state = record.get("state", "")
            target_accounts = state_accounts.get(opp_state, [])

            # Build signal details (shared across matched + unmatched)
            opp_type = (record.get("type") or "").lower()
            org = (record.get("organization") or "").lower()

            opp_title = (record.get("title") or "")[:80]
            if "solicitation" in opp_type or opp_type == "o":
                pts = 30
                heat = "hot"
                title = f"SAM Solicitation: {opp_title}" if opp_title else "Federal Construction Solicitation"
            elif "presolicitation" in opp_type or opp_type == "p":
                pts = 20
                heat = "warm"
                title = f"SAM Pre-Sol: {opp_title}" if opp_title else "Upcoming Federal Construction Opportunity"
            else:
                pts = 15
                heat = "warm"
                title = f"SAM Opportunity: {opp_title}" if opp_title else "Federal Construction Opportunity"

            if "defense" in org or "army" in org or "navy" in org or "air force" in org:
                pts += 10
            elif "transportation" in org or "highway" in org:
                pts += 5

            deadline = record.get("response_deadline", "")
            deadline_str = f" | Deadline: {deadline}" if deadline else ""
            place = f"{record.get('city', '')}, {opp_state}".strip(", ")
            detail = (
                f"{record.get('description', '')[:200]} | "
                f"Agency: {record.get('organization', 'Unknown')}"
                f"{deadline_str}"
                + (f" | {place}" if place else "")
            )

            source_date = None
            try:
                pd_str = record.get("posted_date", "")
                if pd_str:
                    source_date = datetime.strptime(pd_str[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except (ValueError, TypeError):
                pass

            if not target_accounts:
                # No accounts in this state — save unmatched signal for manual review
                db.add(Signal(
                    account_id=None,
                    source="sam",
                    signal_type="solicitation",
                    heat=heat,
                    title=title,
                    detail=detail,
                    raw_data=record,
                    score_contribution=pts,
                    external_id=record["id"],
                    project_name=record.get("title", "")[:100],
                    location_city=record.get("city"),
                    location_state=opp_state,
                    source_date=source_date,
                ))
                records_scored += 1
                continue

            for acct_id in target_accounts:
                acct_info = account_details.get(acct_id, {})

                # Gate check
                if not signal_passes_gates(
                    gates,
                    location_state=opp_state,
                    source="sam",
                    account_segment=acct_info.get("segment"),
                    account_employee_count=acct_info.get("employee_count"),
                ):
                    records_gated += 1
                    continue

                records_matched += 1

                new_signal = Signal(
                    account_id=acct_id,
                    source="sam",
                    signal_type="solicitation",
                    heat=heat,
                    title=title,
                    detail=detail,
                    raw_data=record,
                    score_contribution=pts,
                    external_id=f"{record['id']}_{acct_id}",
                    project_name=record.get("title", "")[:100],
                    location_city=record.get("city"),
                    location_state=opp_state,
                    source_date=source_date,
                )
                db.add(new_signal)
                records_scored += 1

        await db.commit()

    print(f"[{datetime.now().isoformat()}] SAM.gov pipeline complete.")
    print(f"records_fetched={records_fetched} records_matched={records_matched} records_gated={records_gated} records_scored={records_scored}")

if __name__ == "__main__":
    asyncio.run(fetch_sam_data())
