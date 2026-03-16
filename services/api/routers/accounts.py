from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, case
from datetime import datetime, timezone, timedelta

import asyncio

from packages.db.session import get_db
from packages.db.models import Account, AccountLocation, Contact, Signal, Project, User, Activity
from packages.matching.utils import normalize_company_name, check_duplicate_account
from services.api.schemas import (
    AccountCreate, AccountUpdate, AccountRead,
    AccountLocationCreate, AccountLocationUpdate, AccountLocationRead,
    ContactRead, SignalRead, ProjectRead,
    PaginatedResponse, PriorityQueueItem, PriorityQueueResponse,
    BulkAccountUpdate, BulkAccountDelete,
    DuplicateCheckResponse, DuplicateMatch,
)
from services.api.auth import get_current_user, get_visible_account_ids, require_auth, require_director

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


@router.get("", response_model=PaginatedResponse[AccountRead])
async def list_accounts(
    search: str = Query(None),
    segment: str = Query(None),
    deal_stage: str = Query(None),
    tier: int = Query(None),
    view: str = Query("mine"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    query = select(Account)
    count_query = select(func.count(Account.id))

    # Role-based visibility scoping
    if current_user:
        # Validate view param against role
        if current_user.role == 'rep' and view not in ('mine',):
            view = 'mine'
        elif current_user.role == 'manager' and view not in ('mine', 'team'):
            view = 'team'

        visible_ids = await get_visible_account_ids(current_user, view, db)
        if visible_ids is not None:
            query = query.where(Account.id.in_(visible_ids))
            count_query = count_query.where(Account.id.in_(visible_ids))

    if search:
        query = query.where(Account.name.ilike(f"%{search}%"))
        count_query = count_query.where(Account.name.ilike(f"%{search}%"))
    if segment:
        query = query.where(Account.segment == segment)
        count_query = count_query.where(Account.segment == segment)
    if deal_stage:
        query = query.where(Account.deal_stage == deal_stage)
        count_query = count_query.where(Account.deal_stage == deal_stage)
    if tier is not None:
        query = query.where(Account.tier == tier)
        count_query = count_query.where(Account.tier == tier)

    total = (await db.execute(count_query)).scalar() or 0
    result = await db.execute(
        query.order_by(Account.tier.asc(), Account.composite_score.desc()).offset(offset).limit(limit)
    )
    items = [AccountRead.model_validate(a) for a in result.scalars().all()]
    return PaginatedResponse(items=items, total=total, offset=offset, limit=limit)


@router.get("/discovered/count")
async def discovered_count(db: AsyncSession = Depends(get_db)):
    total = (await db.execute(
        select(func.count(Account.id)).where(Account.tier == 0)
    )).scalar() or 0
    return {"count": total}


TIER_WEIGHTS = {1: 100, 2: 60, 3: 20, 0: 0}


@router.get("/priority-queue", response_model=PriorityQueueResponse)
async def priority_queue(
    view: str = Query("mine"),
    limit: int = Query(10, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    day_ago = now - timedelta(hours=24)
    week_ago = now - timedelta(days=7)

    # Scope visibility
    acct_query = select(Account).where(Account.tier > 0)
    if current_user:
        if current_user.role == 'rep' and view not in ('mine',):
            view = 'mine'
        elif current_user.role == 'manager' and view not in ('mine', 'team'):
            view = 'team'
        visible_ids = await get_visible_account_ids(current_user, view, db)
        if visible_ids is not None:
            acct_query = acct_query.where(Account.id.in_(visible_ids))

    accounts = (await db.execute(acct_query)).scalars().all()
    if not accounts:
        return PriorityQueueResponse(items=[])

    account_ids = [a.id for a in accounts]

    # Fetch signal stats in bulk: hot in 24h, warm in 7d, new (unactioned)
    stats_query = select(
        Signal.account_id,
        func.count(case((and_(Signal.heat == 'hot', Signal.detected_at >= day_ago), 1))).label('hot_24h'),
        func.count(case((and_(Signal.heat == 'warm', Signal.detected_at >= week_ago), 1))).label('warm_7d'),
        func.count(case((Signal.status == 'new', 1))).label('new_count'),
    ).where(Signal.account_id.in_(account_ids)).group_by(Signal.account_id)

    stats_result = await db.execute(stats_query)
    stats_map = {}
    for row in stats_result.all():
        stats_map[row[0]] = {
            'hot_24h': row[1],
            'warm_7d': row[2],
            'new_count': row[3],
        }

    # Score and rank
    scored = []
    for acct in accounts:
        s = stats_map.get(acct.id, {'hot_24h': 0, 'warm_7d': 0, 'new_count': 0})
        tier_w = TIER_WEIGHTS.get(acct.tier, 0)
        score = (
            tier_w * 0.4 +
            s['hot_24h'] * 30 +
            s['warm_7d'] * 15 +
            (acct.composite_score or 0) * 0.5 +
            s['new_count'] * 10
        )

        reasons = []
        if s['hot_24h'] > 0:
            reasons.append(f"{s['hot_24h']} hot signal{'s' if s['hot_24h'] != 1 else ''} today")
        if s['warm_7d'] > 0:
            reasons.append(f"{s['warm_7d']} warm signal{'s' if s['warm_7d'] != 1 else ''} this week")
        if s['new_count'] > 0:
            reasons.append(f"{s['new_count']} unactioned signal{'s' if s['new_count'] != 1 else ''}")
        if acct.tier == 1:
            reasons.append("Tier 1 target")
        elif acct.tier == 2:
            reasons.append("Active pipeline")
        if not reasons:
            reasons.append("General account")

        scored.append((acct, score, reasons, s))

    scored.sort(key=lambda x: x[1], reverse=True)
    scored = scored[:limit]

    # Fetch top 3 recent signals for each selected account
    top_account_ids = [item[0].id for item in scored]
    recent_sigs_query = await db.execute(
        select(Signal)
        .where(Signal.account_id.in_(top_account_ids))
        .order_by(Signal.detected_at.desc())
    )
    all_recent = recent_sigs_query.scalars().all()

    sigs_by_account = {}
    for sig in all_recent:
        sigs_by_account.setdefault(sig.account_id, [])
        if len(sigs_by_account[sig.account_id]) < 3:
            sigs_by_account[sig.account_id].append(sig)

    items = []
    for acct, score, reasons, _ in scored:
        items.append(PriorityQueueItem(
            account=AccountRead.model_validate(acct),
            priority_score=round(score, 1),
            reasons=reasons,
            recent_signals=[SignalRead.model_validate(s) for s in sigs_by_account.get(acct.id, [])],
        ))

    return PriorityQueueResponse(items=items)


async def enrich_account_from_signals(account: Account, db: AsyncSession):
    """Auto-fill account fields from its existing signals when promoting from Discovered."""
    signals = (await db.execute(
        select(Signal).where(Signal.account_id == account.id)
            .order_by(Signal.detected_at.desc())
    )).scalars().all()
    if not signals:
        return
    account.composite_score = sum(s.score_contribution for s in signals)
    if not account.hq_city:
        for s in signals:
            if s.location_city:
                account.hq_city = s.location_city
                account.hq_state = s.location_state
                break


@router.get("/check-duplicate", response_model=DuplicateCheckResponse)
async def check_duplicate(
    name: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
):
    """Check if a company name matches any existing account."""
    matches = await check_duplicate_account(name, db)
    return DuplicateCheckResponse(
        has_duplicate=len(matches) > 0,
        matches=[DuplicateMatch(**m) for m in matches],
    )


@router.get("/{account_id}", response_model=AccountRead)
async def get_account(account_id: str, db: AsyncSession = Depends(get_db)):
    account = await db.scalar(select(Account).where(Account.id == account_id))
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return AccountRead.model_validate(account)


@router.post("", response_model=AccountRead, status_code=201)
async def create_account(
    data: AccountCreate,
    force: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    # Check for duplicates unless force=true
    if not force:
        matches = await check_duplicate_account(data.name, db)
        if matches:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "A similar company already exists",
                    "matches": matches,
                },
            )

    account = Account(
        name=data.name,
        name_normalized=normalize_company_name(data.name),
        hq_address=data.hq_address,
        hq_city=data.hq_city,
        hq_state=data.hq_state,
        hq_zip=data.hq_zip,
        region=data.region,
        employee_count=data.employee_count,
        segment=data.segment,
        tier=data.tier or 3,
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return AccountRead.model_validate(account)


@router.put("/{account_id}", response_model=AccountRead)
async def update_account(
    account_id: str, data: AccountUpdate, db: AsyncSession = Depends(get_db)
):
    account = await db.scalar(select(Account).where(Account.id == account_id))
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    old_tier = account.tier
    update_data = data.model_dump(exclude_unset=True)
    if "name" in update_data:
        update_data["name_normalized"] = normalize_company_name(update_data["name"])
    for key, value in update_data.items():
        setattr(account, key, value)
    # Auto-enrich when promoting from Discovered (tier 0) to an active tier
    if old_tier == 0 and account.tier and account.tier > 0:
        await enrich_account_from_signals(account, db)
    await db.commit()
    await db.refresh(account)
    return AccountRead.model_validate(account)


@router.delete("/{account_id}", status_code=204)
async def delete_account(account_id: str, db: AsyncSession = Depends(get_db)):
    account = await db.scalar(select(Account).where(Account.id == account_id))
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    await db.delete(account)
    await db.commit()


# ── Bulk Actions ─────────────────────────────────────────

@router.post("/bulk-update")
async def bulk_update_accounts(
    data: BulkAccountUpdate,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    if not data.ids:
        raise HTTPException(status_code=400, detail="No account IDs provided")
    allowed_fields = {'tier', 'assigned_rep_id', 'deal_stage'}
    updates = {k: v for k, v in data.updates.items() if k in allowed_fields}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid update fields")

    result = await db.execute(select(Account).where(Account.id.in_(data.ids)))
    accounts = result.scalars().all()
    for acct in accounts:
        for key, value in updates.items():
            setattr(acct, key, value)
    await db.commit()
    return {"updated": len(accounts)}


@router.post("/bulk-delete")
async def bulk_delete_accounts(
    data: BulkAccountDelete,
    user: User = Depends(require_director),
    db: AsyncSession = Depends(get_db),
):
    if not data.ids:
        raise HTTPException(status_code=400, detail="No account IDs provided")
    result = await db.execute(select(Account).where(Account.id.in_(data.ids)))
    accounts = result.scalars().all()
    for acct in accounts:
        await db.delete(acct)
    await db.commit()
    return {"deleted": len(accounts)}


# ── Enrichment ────────────────────────────────────────────

@router.post("/{account_id}/enrich")
async def enrich_account(
    account_id: str,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    account = await db.scalar(select(Account).where(Account.id == account_id))
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Gather signals for context
    signals_result = await db.execute(
        select(Signal).where(Signal.account_id == account_id).order_by(Signal.detected_at.desc()).limit(10)
    )
    signals = list(signals_result.scalars().all())

    signal_context = "; ".join(
        f"{s.source}: {s.title} in {s.location_city or '?'}, {s.location_state or '?'}"
        for s in signals[:5]
    )

    try:
        from packages.ai.claude import client, ANTHROPIC_API_KEY
        import json as _json

        if ANTHROPIC_API_KEY:
            resp = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=200,
                temperature=0,
                system="Return ONLY valid JSON with keys: segment, employee_estimate, hq_state. segment is one of: Commercial, Multifamily, Mixed, Industrial, Infrastructure, Residential. employee_estimate is an integer. hq_state is a 2-letter US state code.",
                messages=[{"role": "user", "content": f"Company: {account.name}. Signals: {signal_context}. Infer segment, approximate employee count, and likely HQ state."}],
            )
            data = _json.loads(resp.content[0].text)
            if not account.segment and data.get("segment"):
                account.segment = data["segment"]
            if not account.employee_count and data.get("employee_estimate"):
                account.employee_count = int(data["employee_estimate"])
            if not account.hq_state and data.get("hq_state"):
                account.hq_state = data["hq_state"]
        else:
            # Mock enrichment from signals
            if not account.hq_state and signals:
                for s in signals:
                    if s.location_state:
                        account.hq_state = s.location_state
                        break
            if not account.hq_city and signals:
                for s in signals:
                    if s.location_city:
                        account.hq_city = s.location_city
                        break
            if not account.segment:
                account.segment = "Commercial"
            if not account.employee_count:
                account.employee_count = 150
    except Exception:
        # Fallback: just fill from signals
        await enrich_account_from_signals(account, db)

    await db.commit()
    await db.refresh(account)
    return AccountRead.model_validate(account)


@router.post("/{account_id}/discover-contacts")
async def discover_contacts(
    account_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Fire-and-forget: scrape LinkedIn + company websites for contacts."""
    account = await db.scalar(select(Account).where(Account.id == account_id))
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    from services.pipeline_jobtitles.main import fetch_jobtitle_data
    asyncio.create_task(fetch_jobtitle_data(account_id=account_id))

    return {"status": "started", "message": f"Contact discovery started for {account.name}. New contacts will appear shortly."}


@router.post("/bulk-enrich")
async def bulk_enrich_accounts(
    data: BulkAccountDelete,  # reuse ids-only schema
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    if not data.ids or len(data.ids) > 20:
        raise HTTPException(status_code=400, detail="Provide 1-20 account IDs")
    enriched = 0
    for aid in data.ids:
        account = await db.scalar(select(Account).where(Account.id == aid))
        if account:
            await enrich_account_from_signals(account, db)
            enriched += 1
    await db.commit()
    return {"enriched": enriched}


# ── Sub-resources ────────────────────────────────────────

@router.get("/{account_id}/contacts", response_model=list[ContactRead])
async def get_account_contacts(account_id: str, db: AsyncSession = Depends(get_db)):
    account = await db.scalar(select(Account).where(Account.id == account_id))
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    result = await db.execute(
        select(Contact).where(Contact.account_id == account_id)
    )
    contacts = result.scalars().all()
    items = []
    for c in contacts:
        read = ContactRead.model_validate(c)
        read.account_name = account.name
        items.append(read)
    return items


@router.get("/{account_id}/signals", response_model=list[SignalRead])
async def get_account_signals(account_id: str, db: AsyncSession = Depends(get_db)):
    account = await db.scalar(select(Account).where(Account.id == account_id))
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    result = await db.execute(
        select(Signal)
        .where(Signal.account_id == account_id)
        .order_by(Signal.detected_at.desc())
    )
    return [SignalRead.model_validate(s) for s in result.scalars().all()]


@router.get("/{account_id}/projects", response_model=list[ProjectRead])
async def get_account_projects(account_id: str, db: AsyncSession = Depends(get_db)):
    account = await db.scalar(select(Account).where(Account.id == account_id))
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    result = await db.execute(
        select(Project).where(Project.account_id == account_id)
    )
    projects = result.scalars().all()
    items = []
    for p in projects:
        read = ProjectRead.model_validate(p)
        read.account_name = account.name
        items.append(read)
    return items


# ── Locations ─────────────────────────────────────────────

@router.get("/{account_id}/locations", response_model=list[AccountLocationRead])
async def get_account_locations(account_id: str, db: AsyncSession = Depends(get_db)):
    account = await db.scalar(select(Account).where(Account.id == account_id))
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    result = await db.execute(
        select(AccountLocation)
        .where(AccountLocation.account_id == account_id)
        .order_by(AccountLocation.is_hq.desc(), AccountLocation.label)
    )
    return [AccountLocationRead.model_validate(loc) for loc in result.scalars().all()]


@router.post("/{account_id}/locations", response_model=AccountLocationRead, status_code=201)
async def create_account_location(
    account_id: str,
    data: AccountLocationCreate,
    db: AsyncSession = Depends(get_db),
):
    account = await db.scalar(select(Account).where(Account.id == account_id))
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if data.is_hq:
        existing_hq = await db.execute(
            select(AccountLocation).where(
                AccountLocation.account_id == account_id,
                AccountLocation.is_hq == True,
            )
        )
        for loc in existing_hq.scalars().all():
            loc.is_hq = False
    location = AccountLocation(
        account_id=account_id,
        label=data.label,
        address=data.address,
        city=data.city,
        state=data.state,
        zip=data.zip,
        is_hq=data.is_hq or False,
    )
    db.add(location)
    await db.commit()
    await db.refresh(location)
    return AccountLocationRead.model_validate(location)


@router.put("/{account_id}/locations/{location_id}", response_model=AccountLocationRead)
async def update_account_location(
    account_id: str,
    location_id: str,
    data: AccountLocationUpdate,
    db: AsyncSession = Depends(get_db),
):
    location = await db.scalar(
        select(AccountLocation).where(
            AccountLocation.id == location_id,
            AccountLocation.account_id == account_id,
        )
    )
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    update_data = data.model_dump(exclude_unset=True)
    if update_data.get("is_hq"):
        existing_hq = await db.execute(
            select(AccountLocation).where(
                AccountLocation.account_id == account_id,
                AccountLocation.is_hq == True,
                AccountLocation.id != location_id,
            )
        )
        for loc in existing_hq.scalars().all():
            loc.is_hq = False
    for key, value in update_data.items():
        setattr(location, key, value)
    await db.commit()
    await db.refresh(location)
    return AccountLocationRead.model_validate(location)


@router.delete("/{account_id}/locations/{location_id}", status_code=204)
async def delete_account_location(
    account_id: str,
    location_id: str,
    db: AsyncSession = Depends(get_db),
):
    location = await db.scalar(
        select(AccountLocation).where(
            AccountLocation.id == location_id,
            AccountLocation.account_id == account_id,
        )
    )
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    await db.delete(location)
    await db.commit()


# ── Account Merge ─────────────────────────────────────────

@router.post("/merge")
async def merge_accounts(
    keep_id: str = Query(...),
    merge_id: str = Query(...),
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Merge merge_id into keep_id: move all child records, then delete the source."""
    if keep_id == merge_id:
        raise HTTPException(status_code=400, detail="Cannot merge an account into itself")

    keep = await db.scalar(select(Account).where(Account.id == keep_id))
    merge = await db.scalar(select(Account).where(Account.id == merge_id))
    if not keep or not merge:
        raise HTTPException(status_code=404, detail="One or both accounts not found")

    # Re-parent contacts
    contacts = (await db.execute(select(Contact).where(Contact.account_id == merge_id))).scalars().all()
    for c in contacts:
        c.account_id = keep_id

    # Re-parent signals
    signals = (await db.execute(select(Signal).where(Signal.account_id == merge_id))).scalars().all()
    for s in signals:
        s.account_id = keep_id

    # Re-parent projects
    projects = (await db.execute(select(Project).where(Project.account_id == merge_id))).scalars().all()
    for p in projects:
        p.account_id = keep_id

    # Re-parent activities
    activities = (await db.execute(select(Activity).where(Activity.account_id == merge_id))).scalars().all()
    for a in activities:
        a.account_id = keep_id

    # Re-parent locations (demote to branch)
    locations = (await db.execute(select(AccountLocation).where(AccountLocation.account_id == merge_id))).scalars().all()
    for loc in locations:
        loc.account_id = keep_id
        loc.is_hq = False

    # Take the better composite score
    if merge.composite_score > keep.composite_score:
        keep.composite_score = merge.composite_score

    # Fill in missing fields from the merged account
    for field in ('hq_address', 'hq_city', 'hq_state', 'hq_zip', 'website', 'region', 'segment', 'employee_count'):
        if not getattr(keep, field) and getattr(merge, field):
            setattr(keep, field, getattr(merge, field))

    await db.delete(merge)
    await db.commit()
    await db.refresh(keep)

    return {
        "status": "merged",
        "kept": AccountRead.model_validate(keep),
        "contacts_moved": len(contacts),
        "signals_moved": len(signals),
        "projects_moved": len(projects),
        "locations_moved": len(locations),
    }
