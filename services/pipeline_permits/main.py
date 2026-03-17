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

# Socrata Open Data portals for building permits (SODA API — no key required, 1000/hr limit)
# Each city uses different field names, so we define extractors per city.
# Focused on target states: TX, LA, FL, NC, TN, OK, KS, MO, SC, NM


def extract_dallas_record(row: dict) -> dict | None:
    """Extract from Dallas permit data (dallasopendata.com)."""
    contractor = (row.get("contractor") or "").strip()
    if not contractor:
        return None

    value = 0.0
    try:
        value = float(row.get("value") or 0)
    except (ValueError, TypeError):
        pass

    if value < 500000:
        return None

    return {
        "id": f"permit_dallas_{row.get('permit_num', row.get('id', ''))}",
        "contractor_name": contractor,
        "address": (row.get("street_address") or "").strip(),
        "city": "Dallas",
        "state": "TX",
        "work_description": (row.get("work_description") or "")[:500],
        "estimated_value": value,
        "issue_date": row.get("issued_date", ""),
        "permit_type": row.get("permit_type", ""),
    }


def extract_austin_record(row: dict) -> dict | None:
    """Extract from Austin permit data (data.austintexas.gov)."""
    contractor = (row.get("contractor_company_name") or row.get("contractor_full_name") or "").strip()
    if not contractor:
        return None

    value = 0.0
    try:
        value = float(row.get("total_job_valuation") or row.get("building_valuation") or 0)
    except (ValueError, TypeError):
        pass

    if value < 500000:
        return None

    return {
        "id": f"permit_austin_{row.get('permit_number', row.get('id', ''))}",
        "contractor_name": contractor,
        "address": (row.get("original_address1") or "").strip(),
        "city": "Austin",
        "state": "TX",
        "work_description": (row.get("description") or "")[:500],
        "estimated_value": value,
        "issue_date": row.get("issue_date", ""),
        "permit_type": row.get("permit_type_desc", row.get("work_class", "")),
    }


def extract_fort_worth_record(row: dict) -> dict | None:
    """Extract from Fort Worth permit data (BLDS partner site)."""
    contractor = (row.get("contractorcompanyname") or row.get("contractorfullname") or "").strip()
    if not contractor:
        return None

    value = 0.0
    try:
        value = float(row.get("estprojectcost") or row.get("estprojectcostdec") or 0)
    except (ValueError, TypeError):
        pass

    if value < 500000:
        return None

    return {
        "id": f"permit_ftworth_{row.get('permitnum', row.get('id', ''))}",
        "contractor_name": contractor,
        "address": (row.get("originaladdress1") or "").strip(),
        "city": "Fort Worth",
        "state": "TX",
        "work_description": (row.get("description") or "")[:500],
        "estimated_value": value,
        "issue_date": row.get("issueddate", ""),
        "permit_type": row.get("permittypedesc", row.get("workclass", "")),
    }


def extract_new_orleans_record(row: dict) -> dict | None:
    """Extract from New Orleans permit data (data.nola.gov BLDS)."""
    contractor = (row.get("contractorcompanyname") or "").strip()
    if not contractor:
        return None

    value = 0.0
    try:
        value = float(row.get("estprojectcost") or 0)
    except (ValueError, TypeError):
        pass

    if value < 500000:
        return None

    return {
        "id": f"permit_nola_{row.get('permitnum', row.get('id', ''))}",
        "contractor_name": contractor,
        "address": (row.get("originaladdress1") or "").strip(),
        "city": "New Orleans",
        "state": "LA",
        "work_description": (row.get("description") or "")[:500],
        "estimated_value": value,
        "issue_date": row.get("issuedate", ""),
        "permit_type": row.get("permittypedesc", row.get("workclass", "")),
    }


def extract_chicago_record(row: dict) -> dict | None:
    """Extract a normalized record from Chicago permit data."""
    contractor = ""
    for i in range(1, 11):
        ctype = (row.get(f"contact_{i}_type") or "").upper()
        if "GENERAL CONTRACTOR" in ctype or "CONTRACTOR-GENERAL" in ctype:
            contractor = (row.get(f"contact_{i}_name") or "").strip()
            break
    if not contractor:
        return None

    value = 0.0
    try:
        value = float(row.get("reported_cost") or 0)
    except (ValueError, TypeError):
        pass

    if value < 500000:
        return None

    parts = [row.get("street_number", ""), row.get("street_direction", ""), row.get("street_name", "")]
    address = " ".join(p for p in parts if p).strip()

    return {
        "id": f"permit_chicago_{row.get('id', '')}",
        "contractor_name": contractor,
        "address": address,
        "city": "Chicago",
        "state": "IL",
        "work_description": (row.get("work_description") or "")[:500],
        "estimated_value": value,
        "issue_date": row.get("issue_date", ""),
        "permit_type": row.get("permit_type", ""),
    }


def extract_nyc_record(row: dict) -> dict | None:
    """Extract from NYC permit data (DOB job filings)."""
    contractor = (row.get("applicant_business_name") or "").strip()
    if not contractor:
        return None

    value = 0.0
    try:
        value = float(row.get("initial_cost") or row.get("total_est_fee") or 0)
    except (ValueError, TypeError):
        pass

    if value < 500000:
        return None

    house = row.get("house__", row.get("house_no", ""))
    street = row.get("street_name", "")
    address = f"{house} {street}".strip()

    return {
        "id": f"permit_nyc_{row.get('job__', row.get('job_filing_number', ''))}",
        "contractor_name": contractor,
        "address": address,
        "city": "New York",
        "state": "NY",
        "work_description": (row.get("job_description") or "")[:500],
        "estimated_value": value,
        "issue_date": row.get("issuance_date", row.get("filing_date", "")),
        "permit_type": row.get("permit_type", row.get("job_type", "")),
    }


# City configs: URL, date field for ordering/filtering, and extractor function
# Target states first (TX, LA), then supplemental cities
PERMIT_SOURCES = [
    # ── Texas ──
    {
        "city": "Dallas",
        "base_url": "https://www.dallasopendata.com/resource/e7gq-4sah.json",
        "date_field": "issued_date",
        "extractor": extract_dallas_record,
        "filter_clause": "value > 500000",
    },
    {
        "city": "Austin",
        "base_url": "https://data.austintexas.gov/resource/3syk-w9eu.json",
        "date_field": "issue_date",
        "extractor": extract_austin_record,
        "filter_clause": "total_job_valuation > 500000",
    },
    {
        "city": "Fort Worth",
        "base_url": "https://permits.partner.socrata.com/resource/qy5k-jz7m.json",
        "date_field": "issueddate",
        "extractor": extract_fort_worth_record,
        "filter_clause": "estprojectcost > 500000",
    },
    # ── Louisiana ──
    {
        "city": "New Orleans",
        "base_url": "https://data.nola.gov/resource/72f9-bi28.json",
        "date_field": "issuedate",
        "extractor": extract_new_orleans_record,
        "filter_clause": "estprojectcost > 500000",
    },
    # ── Supplemental (large markets) ──
    {
        "city": "Chicago",
        "base_url": "https://data.cityofchicago.org/resource/ydr8-5enu.json",
        "date_field": "issue_date",
        "extractor": extract_chicago_record,
        "filter_clause": "reported_cost > 500000",
    },
    {
        "city": "New York",
        "base_url": "https://data.cityofnewyork.us/resource/ipu4-2vj7.json",
        "date_field": "issuance_date",
        "extractor": extract_nyc_record,
        "filter_clause": "initial_cost > 500000",
    },
]


async def fetch_from_socrata() -> list[dict]:
    """Fetch building permit data from Socrata open data portals."""
    all_records = []
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m-%dT00:00:00")

    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
        for src in PERMIT_SOURCES:
            try:
                where_clause = f"{src['date_field']} > '{cutoff}'"
                if src.get("filter_clause"):
                    where_clause += f" AND {src['filter_clause']}"

                params = {
                    "$limit": 200,
                    "$order": f"{src['date_field']} DESC",
                    "$where": where_clause,
                }

                headers = {}
                app_token = os.environ.get("SOCRATA_APP_TOKEN")
                if app_token:
                    headers["X-App-Token"] = app_token

                async with session.get(src["base_url"], params=params, headers=headers) as resp:
                    if resp.status != 200:
                        print(f"  Permit API {resp.status} for {src['city']}")
                        continue
                    data = await resp.json()
                    if not data:
                        print(f"  {src['city']}: no permits returned")
                        continue

                    count = 0
                    for row in data:
                        record = src["extractor"](row)
                        if record:
                            all_records.append(record)
                            count += 1

                    print(f"  {src['city']}: {len(data)} raw, {count} with GC + value > $500k")

            except Exception as e:
                print(f"  Permit API error for {src['city']}: {e}")

    return all_records


async def fetch_permit_data():
    print(f"[{datetime.now().isoformat()}] Starting building permit data fetch...")

    records = await fetch_from_socrata()
    print(f"  Fetched {len(records)} total permit records")

    if not records:
        print("  No permit records found from any source")
        return

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
            company_name = record["contractor_name"]
            norm_name = normalize_company_name(company_name)

            matched_id = existing_aliases.get(norm_name)
            if not matched_id and norm_name in existing_accounts:
                matched_id = existing_accounts[norm_name]

            if not matched_id:
                matched_id, score, match_category = fuzzy_match_company(norm_name, existing_accounts)
                if match_category in ['manual_review', 'no_match']:
                    new_acc = Account(
                        name=company_name,
                        name_normalized=norm_name,
                        tier=0,
                        hq_city=record["city"],
                        hq_state=record["state"],
                    )
                    db.add(new_acc)
                    await db.flush()
                    matched_id = new_acc.id
                    existing_accounts[norm_name] = str(new_acc.id)
                    account_details[str(new_acc.id)] = {"segment": None, "employee_count": None}

            if matched_id:
                records_matched += 1

                dup_check = await db.execute(
                    select(Signal).where(Signal.external_id == record["id"])
                )
                if dup_check.scalars().first():
                    continue

                acct_info = account_details.get(str(matched_id), {})
                if not signal_passes_gates(
                    gates,
                    location_state=record["state"],
                    source="permit",
                    project_value=record["estimated_value"],
                    account_segment=acct_info.get("segment"),
                    account_employee_count=acct_info.get("employee_count"),
                ):
                    records_gated += 1
                    continue

                pts = 0
                heat = "cool"
                permit_type = record.get("permit_type", "").lower()

                addr_short = (record.get("address") or "")[:40]
                loc_tag = f" — {addr_short}" if addr_short else ""
                if "new" in permit_type or "construction" in permit_type:
                    pts += 35
                    heat = "hot"
                    title = f"New Construction Permit{loc_tag}"
                elif "alteration" in permit_type or "renovation" in permit_type or "remodel" in permit_type:
                    pts += 20
                    heat = "warm"
                    title = f"Renovation Permit{loc_tag}"
                elif "demolition" in permit_type:
                    pts += 25
                    heat = "warm"
                    title = f"Demolition Permit (Rebuild Likely){loc_tag}"
                else:
                    pts += 10
                    title = f"Building Permit: {record.get('permit_type', 'General')}{loc_tag}"

                if record["estimated_value"] >= 100000000:
                    pts += 25
                elif record["estimated_value"] >= 50000000:
                    pts += 15
                elif record["estimated_value"] >= 10000000:
                    pts += 10

                value_str = f"${record['estimated_value']:,.0f}" if record["estimated_value"] else "N/A"

                source_date = None
                try:
                    if record.get("issue_date"):
                        source_date = datetime.fromisoformat(record["issue_date"].replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    pass

                address = record.get("address", "")
                permit_type_raw = record.get("permit_type", "")
                work_desc = (record.get("work_description") or "")[:250]
                city = record.get("city", "")
                state = record.get("state", "")

                detail_parts = []
                if work_desc:
                    detail_parts.append(work_desc)
                detail_parts.append(f"Permit Type: {permit_type_raw}")
                detail_parts.append(f"Value: {value_str}")
                if address:
                    detail_parts.append(f"Address: {address}, {city}, {state}")
                elif city:
                    detail_parts.append(f"{city}, {state}")
                detail = " | ".join(detail_parts)

                source_url = None

                new_signal = Signal(
                    account_id=matched_id,
                    source="permit",
                    signal_type="permit",
                    heat=heat,
                    title=title,
                    detail=detail,
                    raw_data=record,
                    score_contribution=pts,
                    external_id=record["id"],
                    project_name=record.get("work_description", "")[:100],
                    project_value=record["estimated_value"],
                    location_city=city,
                    location_state=state,
                    source_url=source_url,
                    source_date=source_date,
                )
                db.add(new_signal)
                records_scored += 1

        await db.commit()

    print(f"[{datetime.now().isoformat()}] Permit pipeline complete.")
    print(f"records_fetched={records_fetched} records_matched={records_matched} records_gated={records_gated} records_scored={records_scored}")

if __name__ == "__main__":
    asyncio.run(fetch_permit_data())
