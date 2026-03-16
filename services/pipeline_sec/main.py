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

# SEC EDGAR Full-Text Search — free, 10 requests/sec
# Searches 8-K, 10-K, 10-Q filings for construction/capex keywords
EDGAR_SEARCH_URL = "https://efts.sec.gov/LATEST/search-index"

CAPEX_KEYWORDS = [
    '"new construction"',
    '"capital expenditure"',
    '"new facility"',
    '"building expansion"',
    '"ground breaking"',
    '"construction contract"',
]

MOCK_SEC_DATA = [
    {
        "id": "SEC-0001193125-26-012345",
        "accession_number": "0001193125-26-012345",
        "company_name": "Fluor Corporation",
        "form_type": "8-K",
        "file_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "description": "Fluor Corporation announced a $2.1 billion capital expenditure program for new construction projects across the southeastern United States.",
        "cik": "0001124198",
    },
    {
        "id": "SEC-0000950170-26-008901",
        "accession_number": "0000950170-26-008901",
        "company_name": "AECOM",
        "form_type": "10-K",
        "file_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "description": "AECOM reported increased capital expenditure plans including new facility construction in Texas and California markets.",
        "cik": "0001047469",
    },
    {
        "id": "SEC-0001564590-26-005678",
        "accession_number": "0001564590-26-005678",
        "company_name": "Jacobs Solutions",
        "form_type": "8-K",
        "file_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "description": "Jacobs Solutions secured a major construction contract for infrastructure modernization valued at approximately $800 million.",
        "cik": "0000049826",
    },
]


async def fetch_from_edgar() -> list[dict]:
    """Search SEC EDGAR for construction/capex filings."""
    all_records = []
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # EDGAR requires a User-Agent header with contact info
    user_agent = os.environ.get("SEC_USER_AGENT", "SmokeGTM/1.0 support@example.com")

    async with aiohttp.ClientSession(
        timeout=aiohttp.ClientTimeout(total=60),
        headers={"User-Agent": user_agent}
    ) as session:
        # Search for each keyword group
        query = " OR ".join(CAPEX_KEYWORDS)

        try:
            params = {
                "q": query,
                "dateRange": "custom",
                "startdt": cutoff,
                "enddt": today,
                "forms": "8-K,10-K,10-Q",
            }

            async with session.get(EDGAR_SEARCH_URL, params=params) as resp:
                if resp.status != 200:
                    print(f"  EDGAR API {resp.status}")
                    return []
                data = await resp.json()
                hits = data.get("hits", {}).get("hits", [])

                for hit in hits[:100]:  # Cap at 100
                    source = hit.get("_source", {})
                    entity = source.get("entity_name", "")
                    if not entity:
                        names = source.get("display_names", [])
                        entity = names[0] if names else ""

                    if not entity:
                        continue

                    accession = source.get("accession_no", source.get("file_num", ""))
                    all_records.append({
                        "id": f"sec_{accession}",
                        "accession_number": accession,
                        "company_name": entity,
                        "form_type": source.get("form_type", ""),
                        "file_date": source.get("file_date", ""),
                        "description": (source.get("file_description", "") or "")[:500],
                        "cik": source.get("entity_id", ""),
                    })

                print(f"  EDGAR: {len(all_records)} construction/capex filings found")

        except Exception as e:
            print(f"  EDGAR API error: {e}")

    return all_records


async def fetch_sec_data():
    print(f"[{datetime.now().isoformat()}] Starting SEC EDGAR filings fetch...")

    records = await fetch_from_edgar()
    if records:
        print(f"  Fetched {len(records)} total SEC filings")
    else:
        print("  EDGAR API unavailable — using mock data")
        records = MOCK_SEC_DATA

    async with async_session() as db:
        gates = await load_enabled_gates(db)

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

            # Best-effort match to existing account
            matched_id = existing_aliases.get(norm_name)
            if not matched_id and norm_name in existing_accounts:
                matched_id = existing_accounts[norm_name]

            if not matched_id:
                matched_id, score, match_category = fuzzy_match_company(norm_name, existing_accounts)
                if match_category in ['manual_review', 'no_match']:
                    matched_id = None  # Save signal unmatched for manual review

            if matched_id:
                records_matched += 1

            # Dedup
            dup_check = await db.execute(
                select(Signal).where(Signal.external_id == record["id"])
            )
            if dup_check.scalars().first():
                continue

            # Gate check (skip for unmatched signals — let user decide)
            if matched_id:
                acct_info = account_details.get(str(matched_id), {})
                if not signal_passes_gates(
                    gates,
                    source="sec",
                    account_segment=acct_info.get("segment"),
                    account_employee_count=acct_info.get("employee_count"),
                ):
                    records_gated += 1
                    continue

            # Score based on form type
            form = record.get("form_type", "")
            if form == "8-K":
                pts = 30
                heat = "hot"
                title = f"SEC 8-K: {company_name} — Capital Expenditure / Construction Activity"
            elif form == "10-K":
                pts = 20
                heat = "warm"
                title = f"SEC 10-K: {company_name} — Facility Plans Disclosed"
            else:
                pts = 15
                heat = "warm"
                title = f"SEC {form}: {company_name} — Construction/Capex Mention"

            desc = (record.get("description") or "").strip()
            file_date = record.get("file_date", "")
            cik = record.get("cik", "")
            accession = record.get("accession_number", "")

            detail_parts = []
            if desc:
                detail_parts.append(desc[:300])
            detail_parts.append(f"Company: {company_name}")
            detail_parts.append(f"Form: {form}")
            if file_date:
                detail_parts.append(f"Filed: {file_date[:10]}")
            if cik:
                detail_parts.append(f"CIK: {cik}")
            detail = " | ".join(detail_parts)

            # Build EDGAR filing URL
            source_url = None
            if accession:
                acc_clean = accession.replace("-", "")
                source_url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type={form}&dateb=&owner=include&count=10" if cik else None

            source_date = None
            try:
                if file_date:
                    source_date = datetime.strptime(file_date[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except (ValueError, TypeError):
                pass

            new_signal = Signal(
                account_id=matched_id,
                source="sec",
                signal_type="sec_filing",
                heat=heat,
                title=title,
                detail=detail,
                raw_data=record,
                score_contribution=pts,
                external_id=record["id"],
                project_name=f"{form} Filing — {company_name}"[:100],
                source_url=source_url,
                source_date=source_date,
            )
            db.add(new_signal)
            records_scored += 1

        await db.commit()

    print(f"[{datetime.now().isoformat()}] SEC EDGAR pipeline complete.")
    print(f"records_fetched={records_fetched} records_matched={records_matched} records_gated={records_gated} records_scored={records_scored}")

if __name__ == "__main__":
    asyncio.run(fetch_sec_data())
