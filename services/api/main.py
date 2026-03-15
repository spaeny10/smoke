import os
from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, case
from datetime import datetime, timezone, timedelta
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware

from packages.db.session import get_db, init_db
from packages.db.models import Account, Contact, Signal, Activity
from services.api.auth import require_auth


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()

    # Enforce signal gates on startup — clean up any signals that pre-date gate rules
    try:
        from packages.db.session import async_session
        from packages.matching.signal_gates import enforce_signal_gates
        async with async_session() as db:
            removed = await enforce_signal_gates(db)
            if removed:
                import logging
                logging.getLogger(__name__).info(f"Startup gate enforcement removed {removed} signals")
    except Exception:
        pass

    yield

app = FastAPI(title="Construction GTM API", lifespan=lifespan)

_cors_origins = os.environ.get("CORS_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/api/metrics")
async def get_dashboard_metrics(
    user=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    acct_query = await db.execute(select(func.count(Account.id)).where(Account.tier > 0))
    accounts_count = acct_query.scalar() or 0

    sig_query = await db.execute(select(func.count(Signal.id)))
    signals_count = sig_query.scalar() or 0

    hp_query = await db.execute(
        select(func.count(Contact.id))
        .join(Account, Contact.account_id == Account.id)
        .where(Account.tier.in_([1, 2]))
    )
    hp_contacts = hp_query.scalar() or 0

    out_query = await db.execute(
        select(func.count(Activity.id)).where(Activity.direction == "outbound")
    )
    outreach_sent = out_query.scalar() or 0

    return {
        "activeAccounts": accounts_count,
        "newSignals": signals_count,
        "highPriorityContacts": hp_contacts,
        "outreachSent": outreach_sent,
    }


@app.get("/api/metrics/trends")
async def get_metric_trends(
    user=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Weekly counts for the last 6 weeks — 4 queries instead of 24."""
    now = datetime.now(timezone.utc)
    weeks = []
    for i in range(5, -1, -1):
        week_end = now - timedelta(weeks=i)
        week_start = week_end - timedelta(weeks=1)
        weeks.append((week_start, week_end))
    oldest = weeks[0][0]

    # ── Accounts (cumulative: total active accounts as-of each week end) ──
    acct_cases = [
        func.sum(case((Account.created_at < oldest, 1), else_=0)).label("base"),
        *[func.sum(case(
            (and_(Account.created_at >= s, Account.created_at < e), 1), else_=0
        )).label(f"w{i}") for i, (s, e) in enumerate(weeks)],
    ]
    acct_row = (await db.execute(select(*acct_cases).where(Account.tier > 0))).one()
    base = acct_row[0] or 0
    accounts_trend = []
    for i in range(6):
        base += (acct_row[i + 1] or 0)
        accounts_trend.append(base)

    # ── Signals per week ──
    sig_cases = [
        func.sum(case(
            (and_(Signal.created_at >= s, Signal.created_at < e), 1), else_=0
        )).label(f"w{i}") for i, (s, e) in enumerate(weeks)
    ]
    sig_row = (await db.execute(
        select(*sig_cases).where(Signal.created_at >= oldest)
    )).one()
    signals_trend = [sig_row[i] or 0 for i in range(6)]

    # ── Contacts at T1/T2 (cumulative) ──
    con_cases = [
        func.sum(case((Contact.created_at < oldest, 1), else_=0)).label("base"),
        *[func.sum(case(
            (and_(Contact.created_at >= s, Contact.created_at < e), 1), else_=0
        )).label(f"w{i}") for i, (s, e) in enumerate(weeks)],
    ]
    con_row = (await db.execute(
        select(*con_cases)
        .join(Account, Contact.account_id == Account.id)
        .where(Account.tier.in_([1, 2]))
    )).one()
    cbase = con_row[0] or 0
    contacts_trend = []
    for i in range(6):
        cbase += (con_row[i + 1] or 0)
        contacts_trend.append(cbase)

    # ── Outreach per week ──
    out_cases = [
        func.sum(case(
            (and_(Activity.created_at >= s, Activity.created_at < e), 1), else_=0
        )).label(f"w{i}") for i, (s, e) in enumerate(weeks)
    ]
    out_row = (await db.execute(
        select(*out_cases).where(
            and_(Activity.direction == "outbound", Activity.created_at >= oldest)
        )
    )).one()
    outreach_trend = [out_row[i] or 0 for i in range(6)]

    return {
        "accounts": accounts_trend,
        "signals": signals_trend,
        "contacts": contacts_trend,
        "outreach": outreach_trend,
    }


# ── Global search ─────────────────────────────────────────
@app.get("/api/search")
async def global_search(
    q: str = "",
    user=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Search across accounts, contacts, and signals in one call."""
    if not q or len(q) < 2:
        return {"accounts": [], "contacts": [], "signals": []}

    pattern = f"%{q}%"

    acct_rows = (await db.execute(
        select(Account.id, Account.name, Account.tier, Account.deal_stage)
        .where(Account.name.ilike(pattern))
        .order_by(Account.composite_score.desc())
        .limit(5)
    )).all()

    con_rows = (await db.execute(
        select(Contact.id, Contact.name, Contact.email, Contact.account_id)
        .where(Contact.name.ilike(pattern) | Contact.email.ilike(pattern))
        .limit(5)
    )).all()

    sig_rows = (await db.execute(
        select(Signal.id, Signal.title, Signal.source, Signal.account_id)
        .where(Signal.title.ilike(pattern) | Signal.detail.ilike(pattern))
        .order_by(Signal.detected_at.desc())
        .limit(5)
    )).all()

    return {
        "accounts": [{"id": r[0], "name": r[1], "tier": r[2], "deal_stage": r[3]} for r in acct_rows],
        "contacts": [{"id": r[0], "name": r[1], "email": r[2], "account_id": r[3]} for r in con_rows],
        "signals": [{"id": r[0], "title": r[1], "source": r[2], "account_id": r[3]} for r in sig_rows],
    }


# ── CSV Export ─────────────────────────────────────────────
from fastapi.responses import StreamingResponse
import csv, io as _io

@app.get("/api/export/accounts")
async def export_accounts(
    user=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Account).where(Account.tier > 0).order_by(Account.name)
    )).scalars().all()
    buf = _io.StringIO()
    w = csv.writer(buf)
    w.writerow(["name", "hq_city", "hq_state", "segment", "tier", "deal_stage", "composite_score", "website", "employee_count"])
    for a in rows:
        w.writerow([a.name, a.hq_city, a.hq_state, a.segment, a.tier, a.deal_stage, a.composite_score, a.website, a.employee_count])
    buf.seek(0)
    return StreamingResponse(buf, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=accounts.csv"})


@app.get("/api/export/contacts")
async def export_contacts(
    user=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(Contact).order_by(Contact.name))).scalars().all()
    buf = _io.StringIO()
    w = csv.writer(buf)
    w.writerow(["name", "email", "phone", "title", "role_category", "source", "account_id"])
    for c in rows:
        w.writerow([c.name, c.email, c.phone, c.title, c.role_category, c.source, c.account_id])
    buf.seek(0)
    return StreamingResponse(buf, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=contacts.csv"})


@app.get("/api/export/signals")
async def export_signals(
    user=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(Signal).order_by(Signal.detected_at.desc()))).scalars().all()
    buf = _io.StringIO()
    w = csv.writer(buf)
    w.writerow(["title", "source", "signal_type", "heat", "status", "detail", "location_city", "location_state", "detected_at", "account_id"])
    for s in rows:
        w.writerow([s.title, s.source, s.signal_type, s.heat, s.status, s.detail, s.location_city, s.location_state, s.detected_at, s.account_id])
    buf.seek(0)
    return StreamingResponse(buf, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=signals.csv"})


# ── CSV Import (was inline, now still here but cleaner) ────
from fastapi import UploadFile, File
from typing import Dict, Any
import pandas as pd

from packages.db.models import CompanyAlias, User
from packages.matching.utils import normalize_company_name, fuzzy_match_company

@app.post("/accounts/import/csv")
async def import_accounts_csv(
    file: UploadFile = File(...),
    user=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    content = await file.read()
    try:
        df = pd.read_csv(_io.StringIO(content.decode("utf-8")))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing CSV: {e}")

    required_cols = ['company_name']
    if not all(col in df.columns for col in required_cols):
        raise HTTPException(status_code=400, detail=f"CSV missing required columns: {required_cols}")

    result = await db.execute(select(Account.id, Account.name_normalized))
    existing_accounts = {row.name_normalized: str(row.id) for row in result.all()}

    alias_result = await db.execute(select(CompanyAlias.alias, CompanyAlias.account_id))
    existing_aliases = {row.alias: str(row.account_id) for row in alias_result.all()}

    results: Dict[str, Any] = {
        "auto_matched": 0, "flagged_for_review": 0, "manual_review_required": 0,
        "new_accounts_created": 0, "contacts_added": 0, "errors": []
    }

    for index, row in df.iterrows():
        try:
            company_name = str(row['company_name'])
            norm_name = normalize_company_name(company_name)

            contact_name = str(row.get('contact_name', ''))
            contact_email = str(row.get('contact_email', ''))
            contact_phone = str(row.get('contact_phone', ''))

            if pd.isna(contact_name) or contact_name == 'nan': contact_name = ""
            if pd.isna(contact_email) or contact_email == 'nan': contact_email = ""
            if pd.isna(contact_phone) or contact_phone == 'nan': contact_phone = ""

            matched_id = existing_aliases.get(norm_name)
            match_category = "alias_match"
            score = 100.0

            if not matched_id and norm_name in existing_accounts:
                matched_id = existing_accounts[norm_name]
                match_category = "exact_match"

            if not matched_id:
                matched_id, score, match_category = fuzzy_match_company(norm_name, existing_accounts)

            account_id_to_use = None

            if match_category in ("exact_match", "alias_match", "auto_match", "flagged_auto_match"):
                if match_category == "flagged_auto_match":
                    results["flagged_for_review"] += 1
                else:
                    results["auto_matched"] += 1
                account_id_to_use = matched_id

            elif match_category == "manual_review":
                results["manual_review_required"] += 1
                continue

            else:
                new_acc = Account(
                    name=company_name,
                    name_normalized=norm_name,
                    hq_address=str(row.get('address', '')) if 'address' in row and pd.notna(row['address']) else None,
                    hq_city=str(row.get('city', '')) if 'city' in row and pd.notna(row['city']) else None,
                    hq_state=str(row.get('state', '')) if 'state' in row and pd.notna(row['state']) else None,
                    hq_zip=str(row.get('zip', '')) if 'zip' in row and pd.notna(row['zip']) else None,
                )
                reps_result = await db.execute(select(User).where(User.role == 'rep'))
                reps = reps_result.scalars().all()
                if reps:
                    import random
                    new_acc.assigned_rep_id = random.choice(reps).id
                db.add(new_acc)
                await db.flush()
                account_id_to_use = new_acc.id
                existing_accounts[norm_name] = str(new_acc.id)
                results["new_accounts_created"] += 1

            if contact_name and account_id_to_use:
                new_contact = Contact(
                    account_id=account_id_to_use,
                    name=contact_name,
                    email=contact_email,
                    phone=contact_phone or None,
                    title=str(row.get('title', '')) if 'title' in row and pd.notna(row['title']) else None,
                    source='CSV'
                )
                db.add(new_contact)
                results["contacts_added"] += 1

        except Exception as e:
            results["errors"].append(f"Row {index}: {str(e)}")

    await db.commit()
    return {"message": "Import sequence complete.", "results": results}


# ── Outreach generation ────────────────────────────────────
from packages.ai.claude import generate_outreach_email
from services.api.schemas import OutreachGenerateRequest

@app.post("/api/outreach/generate")
async def generate_outreach(req: OutreachGenerateRequest, db: AsyncSession = Depends(get_db)):
    account = await db.scalar(select(Account).where(Account.id == req.account_id))
    contact = await db.scalar(select(Contact).where(Contact.id == req.contact_id))
    if not account or not contact:
        raise HTTPException(status_code=404, detail="Account or Contact not found")
    signals_query = await db.execute(select(Signal).where(Signal.account_id == req.account_id).order_by(Signal.detected_at.desc()).limit(3))
    signals = list(signals_query.scalars().all())
    message_text = await generate_outreach_email(account, signals, contact)
    return {"status": "success", "message_text": message_text, "signals_used": [s.id for s in signals]}


@app.get("/api/demo/outreach")
async def demo_outreach(db: AsyncSession = Depends(get_db)):
    account = await db.scalar(select(Account).limit(1))
    contact = await db.scalar(select(Contact).limit(1))
    if not account:
        return {"status": "error", "message": "No accounts in DB. Run seed or CSV upload first."}
    signals_query = await db.execute(select(Signal).where(Signal.account_id == account.id).order_by(Signal.detected_at.desc()).limit(3))
    signals = list(signals_query.scalars().all())
    message_text = await generate_outreach_email(account, signals, contact)
    return {
        "status": "success",
        "account_name": account.name,
        "contact_name": contact.name if contact else "Team",
        "message_text": message_text,
        "signals_used": len(signals)
    }


# ── Routers ────────────────────────────────────────────────
from services.api.routers import accounts, contacts, projects, signals, auth, ai, teams, users, signal_gates, pipelines, notifications, activities, saved_views, reports, sequences

app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(contacts.router)
app.include_router(projects.router)
app.include_router(signals.router)
app.include_router(ai.router)
app.include_router(teams.router)
app.include_router(users.router)
app.include_router(signal_gates.router)
app.include_router(pipelines.router)
app.include_router(notifications.router)
app.include_router(activities.router)
app.include_router(saved_views.router)
app.include_router(reports.router)
app.include_router(sequences.router)

# Serve built frontend static files in production
from pathlib import Path
from fastapi.staticfiles import StaticFiles

_static_dir = Path(__file__).resolve().parent.parent.parent / "static"
if _static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="static")
