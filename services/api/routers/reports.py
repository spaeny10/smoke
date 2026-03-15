from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone, timedelta

from packages.db.session import get_db
from packages.db.models import Signal, Account, User
from services.api.auth import require_auth, get_current_user, get_visible_account_ids

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/signals-by-source")
async def signals_by_source(
    user=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Signal.source, func.count(Signal.id).label("count"))
        .group_by(Signal.source)
        .order_by(func.count(Signal.id).desc())
    )
    return [{"source": row[0], "count": row[1]} for row in result.all()]


@router.get("/signals-by-state")
async def signals_by_state(
    view: str = Query("all"),
    current_user: Optional[User] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Signal.location_state, func.count(Signal.id).label("count"))
        .where(Signal.location_state.isnot(None))
    )

    # Apply same visibility scoping as signals list
    if current_user:
        if current_user.role == 'rep' and view not in ('mine',):
            view = 'mine'
        elif current_user.role == 'manager' and view not in ('mine', 'team'):
            view = 'team'

        visible_ids = await get_visible_account_ids(current_user, view, db)
        if visible_ids is not None:
            query = query.where(Signal.account_id.in_(visible_ids))

    result = await db.execute(
        query.group_by(Signal.location_state)
        .order_by(func.count(Signal.id).desc())
    )
    return [{"state": row[0], "count": row[1]} for row in result.all()]


@router.get("/signals-over-time")
async def signals_over_time(
    days: int = Query(30, ge=1, le=365),
    user=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(
            func.date(Signal.detected_at).label("day"),
            func.count(Signal.id).label("count"),
        )
        .where(Signal.detected_at >= cutoff)
        .group_by(func.date(Signal.detected_at))
        .order_by(func.date(Signal.detected_at))
    )
    return [{"date": str(row[0]), "count": row[1]} for row in result.all()]


@router.get("/pipeline-summary")
async def pipeline_summary(
    user=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    tier_result = await db.execute(
        select(Account.tier, func.count(Account.id).label("count"))
        .group_by(Account.tier)
        .order_by(Account.tier)
    )
    tiers = [{"tier": row[0], "count": row[1]} for row in tier_result.all()]

    stage_result = await db.execute(
        select(Account.deal_stage, func.count(Account.id).label("count"))
        .group_by(Account.deal_stage)
        .order_by(func.count(Account.id).desc())
    )
    stages = [{"stage": row[0], "count": row[1]} for row in stage_result.all()]

    return {"tiers": tiers, "stages": stages}


@router.get("/top-accounts")
async def top_accounts(
    limit: int = Query(10, le=50),
    user=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    # Get top accounts by composite score, with signal counts
    subq = (
        select(Signal.account_id, func.count(Signal.id).label("signal_count"))
        .group_by(Signal.account_id)
        .subquery()
    )
    result = await db.execute(
        select(Account, subq.c.signal_count)
        .outerjoin(subq, Account.id == subq.c.account_id)
        .where(Account.tier > 0)
        .order_by(Account.composite_score.desc())
        .limit(limit)
    )
    items = []
    for row in result.all():
        acct = row[0]
        items.append({
            "id": acct.id,
            "name": acct.name,
            "tier": acct.tier,
            "composite_score": acct.composite_score,
            "deal_stage": acct.deal_stage,
            "segment": acct.segment,
            "signal_count": row[1] or 0,
        })
    return items
