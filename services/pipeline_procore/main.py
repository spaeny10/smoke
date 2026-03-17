import asyncio
import os
import sys
from datetime import datetime, timezone
from sqlalchemy import select

# Add to sys.path to run standalone
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from packages.db.session import async_session
from packages.db.models import Account, CompanyAlias, Signal, Contact
from packages.matching.utils import normalize_company_name, fuzzy_match_company
from packages.matching.signal_gates import load_enabled_gates, signal_passes_gates
from packages.integrations.procore import ProcoreClient
from services.pipeline_jobtitles.role_classifier import classify_role

# Procore stage names mapped to our internal stages
PROCORE_STAGE_MAP = {
    "Bidding": "Bidding",
    "Pre-Construction": "Pre-Construction",
    "Active": "Active",
    "Course of Construction": "Active",
    "Warranty": "Warranty",
}

# Map Procore permission_template names to our role_category values
PROCORE_ROLE_MAP = {
    "Safety Manager": "Safety",
    "Project Manager": "Project Management",
    "Site Supervisor": "Project Management",
    "Superintendent": "Project Management",
    "Project Engineer": "Engineering",
    "Estimator": "Preconstruction",
    "Project Executive": "Executive",
    "Owner": "Decision Maker",
}


def _parse_location(record: dict) -> tuple:
    """Extract (city, state) from record location string."""
    loc = record.get("location", "")
    if "," in loc:
        return loc.split(",")[0].strip() or None, loc.split(",")[1].strip() or None
    return None, None


def _parse_source_date(record: dict):
    """Parse created_at into a timezone-aware datetime."""
    try:
        ca = record.get("created_at")
        if ca:
            if "T" in str(ca):
                return datetime.fromisoformat(str(ca).replace("Z", "+00:00"))
            return datetime.strptime(str(ca)[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        pass
    return None


def _build_detail(record: dict) -> str:
    """Build a standard detail string for Procore signals."""
    proj_name = record.get("project_name", "")
    company = record.get("company_name", "")
    value_str = f"${record.get('estimated_value', 0):,.0f}"
    loc = record.get("location", "")
    stage = record.get("stage", "")

    parts = [f"Project: {proj_name}"]
    if company:
        parts.append(f"Company: {company}")
    parts.append(f"Stage: {stage}")
    parts.append(f"Est. Value: {value_str}")
    if loc:
        parts.append(loc)
    return " | ".join(parts)


async def fetch_from_procore_api() -> list[dict]:
    """Fetch project data with users and RFI counts from Procore API."""
    client = ProcoreClient()
    if not client.is_configured:
        return []

    projects = await client.get_projects()
    records = []
    for p in projects:
        city = p.get("city", "") or ""
        state = p.get("state_code", "") or ""
        location = f"{city}, {state}" if city and state else city or state or ""

        stage = PROCORE_STAGE_MAP.get(p.get("stage", ""), p.get("stage", ""))
        project_id = p.get("id")

        # Fetch users and RFIs per project
        users = await client.get_project_users(project_id) if project_id else []
        rfis = await client.get_rfis(project_id) if project_id else []
        open_rfi_count = sum(1 for r in rfis if (r.get("status") or "").lower() == "open")

        records.append({
            "id": project_id,
            "project_name": p.get("name", ""),
            "company_name": p.get("company", {}).get("name", "") if isinstance(p.get("company"), dict) else "",
            "stage": stage,
            "estimated_value": float(p.get("estimated_value", 0) or 0),
            "created_at": p.get("created_at", datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")),
            "location": location,
            "users": users,
            "rfi_count": open_rfi_count,
        })
    return records


async def _add_signal(db, ext_id: str, gates, record, matched_id, acct_info, **kwargs) -> bool:
    """Create a signal if it doesn't already exist and passes gates. Returns True if created."""
    dup = await db.execute(select(Signal).where(Signal.external_id == ext_id))
    if dup.scalars().first():
        return False

    loc_city, loc_state = _parse_location(record)
    if not signal_passes_gates(
        gates,
        location_state=loc_state,
        source="procore",
        project_value=record.get("estimated_value"),
        account_segment=acct_info.get("segment"),
        account_employee_count=acct_info.get("employee_count"),
    ):
        return False

    signal = Signal(
        account_id=matched_id,
        source="procore",
        external_id=ext_id,
        raw_data=record,
        project_name=record.get("project_name", "")[:100],
        project_value=record.get("estimated_value"),
        location_city=loc_city,
        location_state=loc_state,
        source_date=_parse_source_date(record),
        source_url=None,
        **kwargs,
    )
    db.add(signal)
    return True


async def fetch_procore_data():
    print(f"[{datetime.now().isoformat()}] Starting Procore data fetch...")

    records = await fetch_from_procore_api()
    print(f"  Fetched {len(records)} projects from Procore API")

    if not records:
        client = ProcoreClient()
        if not client.is_configured:
            print("  Procore not configured — skipping pipeline")
        else:
            print("  No Procore projects returned")
        return

    async with async_session() as db:
        gates = await load_enabled_gates(db)

        # Load accounts for matching
        result = await db.execute(select(Account.id, Account.name_normalized, Account.segment, Account.employee_count))
        rows = result.all()
        existing_accounts = {row.name_normalized: str(row.id) for row in rows}
        account_details = {str(row.id): {"segment": row.segment, "employee_count": row.employee_count} for row in rows}

        alias_result = await db.execute(select(CompanyAlias.alias, CompanyAlias.account_id))
        existing_aliases = {row.alias: str(row.account_id) for row in alias_result.all()}

        # Preload existing Procore contact emails for dedup
        contact_result = await db.execute(select(Contact.account_id, Contact.email).where(Contact.source == "Procore"))
        existing_contact_emails: dict[str, set[str]] = {}
        for row in contact_result.all():
            if row.email:
                existing_contact_emails.setdefault(row.account_id, set()).add(row.email.lower())

        records_fetched = len(records)
        records_matched = 0
        signals_created = 0
        contacts_created = 0
        records_gated = 0

        # Track active projects per account for multi_project signal
        account_active_projects: dict[str, list[dict]] = {}

        for record in records:
            company_name = record["company_name"]
            norm_name = normalize_company_name(company_name)

            # Match to existing account
            matched_id = existing_aliases.get(norm_name)
            if not matched_id and norm_name in existing_accounts:
                matched_id = existing_accounts[norm_name]

            if not matched_id:
                matched_id, score, match_category = fuzzy_match_company(norm_name, existing_accounts)
                if match_category in ['manual_review', 'no_match']:
                    loc_city, loc_state = _parse_location(record)
                    new_acc = Account(
                        name=company_name,
                        name_normalized=norm_name,
                        tier=0,
                        hq_city=loc_city,
                        hq_state=loc_state,
                    )
                    db.add(new_acc)
                    await db.flush()
                    matched_id = new_acc.id
                    existing_accounts[norm_name] = str(new_acc.id)
                    account_details[str(new_acc.id)] = {"segment": None, "employee_count": None}

            if not matched_id:
                continue

            records_matched += 1
            acct_info = account_details.get(str(matched_id), {})
            detail = _build_detail(record)

            # ── Signal 1: project_created (every new project) ──
            pts = 20
            if record["estimated_value"] >= 100_000_000:
                pts += 20
            elif record["estimated_value"] >= 50_000_000:
                pts += 10

            if await _add_signal(
                db, f"procore_created_{record['id']}", gates, record, matched_id, acct_info,
                signal_type="project_created",
                heat="warm",
                title=f"New Procore Project: {record['project_name']}",
                detail=detail,
                score_contribution=pts,
            ):
                signals_created += 1
            else:
                # Check if it was gated (not just a dup)
                dup = await db.execute(select(Signal.id).where(Signal.external_id == f"procore_created_{record['id']}"))
                if not dup.scalars().first():
                    records_gated += 1

            # ── Signal 2: project_active (stage == Active) ──
            if record["stage"] == "Active":
                if await _add_signal(
                    db, f"procore_active_{record['id']}", gates, record, matched_id, acct_info,
                    signal_type="project_active",
                    heat="hot",
                    title=f"Active Procore Project: {record['project_name']}",
                    detail=detail,
                    score_contribution=25,
                ):
                    signals_created += 1

                account_active_projects.setdefault(str(matched_id), []).append(record)

            # ── Signal 3: safety_manager_assigned ──
            safety_managers = [
                u for u in record.get("users", [])
                if "safety" in ((u.get("permission_template") or {}).get("name", "") or "").lower()
            ]
            if safety_managers:
                sm_names = ", ".join(u.get("name", "Unknown") for u in safety_managers[:3])
                if await _add_signal(
                    db, f"procore_safety_{record['id']}", gates, record, matched_id, acct_info,
                    signal_type="safety_manager_assigned",
                    heat="warm",
                    title=f"Safety Manager Assigned: {record['project_name']}",
                    detail=f"Safety Manager(s): {sm_names} | {detail}",
                    score_contribution=15,
                ):
                    signals_created += 1

            # ── Signal 4: rfi_volume (50+ open RFIs) ──
            if record.get("rfi_count", 0) >= 50:
                if await _add_signal(
                    db, f"procore_rfi_{record['id']}", gates, record, matched_id, acct_info,
                    signal_type="rfi_volume",
                    heat="cool",
                    title=f"High RFI Volume: {record['project_name']}",
                    detail=f"{record['rfi_count']} open RFIs | {detail}",
                    score_contribution=10,
                ):
                    signals_created += 1

            # ── Contact extraction from project users ──
            for user in record.get("users", []):
                email = (user.get("email_address") or "").strip().lower()
                if not email:
                    continue

                # Dedup by email within account
                acct_emails = existing_contact_emails.get(str(matched_id), set())
                if email in acct_emails:
                    continue

                user_name = (user.get("name") or "").strip()
                if not user_name:
                    continue

                procore_role = (user.get("permission_template") or {}).get("name", "")
                role_category = PROCORE_ROLE_MAP.get(procore_role, classify_role(procore_role))

                new_contact = Contact(
                    account_id=matched_id,
                    name=user_name,
                    title=procore_role,
                    role_category=role_category,
                    email=email,
                    source="Procore",
                )
                db.add(new_contact)
                contacts_created += 1
                existing_contact_emails.setdefault(str(matched_id), set()).add(email)

        # ── Signal 5: multi_project (3+ active projects per account) ──
        for acct_id, active_projects in account_active_projects.items():
            if len(active_projects) >= 3:
                ext_id = f"procore_multi_{acct_id}"
                dup = await db.execute(select(Signal).where(Signal.external_id == ext_id))
                if dup.scalars().first():
                    continue

                acct_info = account_details.get(acct_id, {})
                first_proj = active_projects[0]
                loc_city, loc_state = _parse_location(first_proj)

                if signal_passes_gates(
                    gates,
                    location_state=loc_state,
                    source="procore",
                    account_segment=acct_info.get("segment"),
                    account_employee_count=acct_info.get("employee_count"),
                ):
                    project_names = ", ".join(p["project_name"] for p in active_projects[:5])
                    total_value = sum(p.get("estimated_value", 0) for p in active_projects)
                    signal = Signal(
                        account_id=acct_id,
                        source="procore",
                        signal_type="multi_project",
                        heat="hot",
                        title=f"Multi-Project Account: {len(active_projects)} Active Projects",
                        detail=f"Active projects: {project_names} | Combined value: ${total_value:,.0f}",
                        raw_data={"project_count": len(active_projects), "project_ids": [p["id"] for p in active_projects]},
                        score_contribution=20,
                        external_id=ext_id,
                        location_city=loc_city,
                        location_state=loc_state,
                        source_url=None,
                    )
                    db.add(signal)
                    signals_created += 1

        await db.commit()

    print(f"[{datetime.now().isoformat()}] Procore pipeline complete.")
    print(f"records_fetched={records_fetched} records_matched={records_matched} "
          f"records_gated={records_gated} signals_created={signals_created} contacts_created={contacts_created}")

if __name__ == "__main__":
    asyncio.run(fetch_procore_data())
