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

# EPA ECHO REST API — free, no key required
# Searches for construction-related environmental permits and violations
ECHO_BASE = "https://echodata.epa.gov/echo"

# SIC codes for construction industries
CONSTRUCTION_SIC = ["15", "16", "17"]  # General Building, Heavy Construction, Special Trade


async def fetch_from_echo() -> list[dict]:
    """Fetch construction-related EPA permits and enforcement actions."""
    all_records = []

    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=60)) as session:
        # Query each program (CWA, CAA, RCRA) for construction SIC codes
        programs = [
            ("cwa_rest_services", "Clean Water Act"),
            ("air_rest_services", "Clean Air Act"),
            ("rcra_rest_services", "RCRA"),
        ]

        for program_api, program_name in programs:
            try:
                # Step 1: Get a query ID
                qid_url = f"{ECHO_BASE}/{program_api}.get_qid"
                qid_params = {
                    "output": "JSON",
                    "p_sic2": ",".join(CONSTRUCTION_SIC),
                    "p_act": "Y",  # Active facilities only
                    "p_qlft": ">=",
                    "p_qval": "1",
                    "responseset": "100",
                }

                async with session.get(qid_url, params=qid_params) as resp:
                    if resp.status != 200:
                        print(f"  EPA ECHO {program_name} QID request {resp.status}")
                        continue
                    data = await resp.json()
                    qid = data.get("Results", {}).get("QueryID")
                    if not qid:
                        continue

                # Step 2: Fetch facilities
                fac_url = f"{ECHO_BASE}/{program_api}.get_facilities"
                fac_params = {"output": "JSON", "qid": qid, "responseset": "100"}

                async with session.get(fac_url, params=fac_params) as resp:
                    if resp.status != 200:
                        continue
                    data = await resp.json()
                    facilities = data.get("Results", {}).get("Facilities", [])

                    for fac in facilities:
                        operator = (fac.get("OperatorName") or fac.get("FacName") or "").strip()
                        if not operator:
                            continue

                        state = fac.get("FacState", fac.get("StateName", ""))
                        city = fac.get("FacCity", fac.get("CityName", ""))
                        reg_id = fac.get("RegistryID", fac.get("SourceID", ""))

                        # Determine if violation or permit
                        has_violation = fac.get("CurrVioFlag", "N") == "Y"
                        activity = "violation" if has_violation else "permit_issued"

                        all_records.append({
                            "id": f"epa_{reg_id}_{program_api[:3]}",
                            "facility_name": fac.get("FacName", ""),
                            "registry_id": reg_id,
                            "operator_name": operator,
                            "city": city,
                            "state": state,
                            "sic_code": fac.get("SICCodes", ""),
                            "permit_type": program_name,
                            "compliance_status": "Violation" if has_violation else "In Compliance",
                            "last_inspection_date": fac.get("FacDateLastInspection", ""),
                            "activity_type": activity,
                        })

                    print(f"  EPA {program_name}: {len(facilities)} construction facilities")

            except Exception as e:
                print(f"  EPA ECHO {program_name} error: {e}")

    return all_records


async def fetch_epa_data():
    print(f"[{datetime.now().isoformat()}] Starting EPA environmental permits fetch...")

    records = await fetch_from_echo()
    print(f"  Fetched {len(records)} total EPA records")

    if not records:
        print("  No EPA records returned from ECHO API")
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
            company_name = record["operator_name"]
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
                    location_state=record.get("state"),
                    source="epa",
                    account_segment=acct_info.get("segment"),
                    account_employee_count=acct_info.get("employee_count"),
                ):
                    records_gated += 1
                    continue

            # Score based on activity type
            activity = record.get("activity_type", "")
            permit_type = record.get("permit_type", "")

            facility = record.get("facility_name", "") or company_name
            if activity == "violation":
                pts = 20
                heat = "warm"
                title = f"EPA Violation: {facility} — {permit_type}"
            else:
                pts = 15
                heat = "cool"
                title = f"EPA Permit: {facility} — {permit_type}"

            place = f"{record.get('city', '')}, {record.get('state', '')}".strip(", ")
            reg_id = record.get("registry_id", "")
            sic = record.get("sic_code", "")
            compliance = record.get("compliance_status", "Unknown")

            detail_parts = [f"Facility: {facility}", f"Program: {permit_type}", f"Status: {compliance}"]
            if sic:
                detail_parts.append(f"SIC: {sic}")
            if place:
                detail_parts.append(place)
            insp = record.get("last_inspection_date", "")
            if insp:
                detail_parts.append(f"Last Inspection: {insp}")
            detail_parts.append(f"Operator: {company_name}")
            detail = " | ".join(detail_parts)

            # EPA ECHO facility detail page
            source_url = f"https://echo.epa.gov/detailed-facility-report?fid={reg_id}" if reg_id else None

            source_date = None
            try:
                if insp and "/" in insp:
                    source_date = datetime.strptime(insp, "%m/%d/%Y").replace(tzinfo=timezone.utc)
                elif insp and "-" in insp:
                    source_date = datetime.strptime(insp[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except (ValueError, TypeError):
                pass

            new_signal = Signal(
                account_id=matched_id,
                source="epa",
                signal_type="environmental_permit",
                heat=heat,
                title=title,
                detail=detail,
                raw_data=record,
                score_contribution=pts,
                external_id=record["id"],
                project_name=record.get("facility_name", "")[:100],
                location_city=record.get("city"),
                location_state=record.get("state"),
                source_url=source_url,
                source_date=source_date,
            )
            db.add(new_signal)
            records_scored += 1

        await db.commit()

    print(f"[{datetime.now().isoformat()}] EPA pipeline complete.")
    print(f"records_fetched={records_fetched} records_matched={records_matched} records_gated={records_gated} records_scored={records_scored}")

if __name__ == "__main__":
    asyncio.run(fetch_epa_data())
