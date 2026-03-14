from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_

from packages.db.session import get_db
from packages.db.models import Signal, Account, User, SignalGate
from services.api.schemas import SignalCreate, SignalRead, SignalStatusUpdate, PaginatedResponse
from services.api.auth import get_current_user, get_visible_account_ids

router = APIRouter(prefix="/api/signals", tags=["signals"])


@router.get("", response_model=PaginatedResponse[SignalRead])
async def list_signals(
    account_id: str = Query(None),
    source: str = Query(None),
    heat: str = Query(None),
    status: str = Query(None),
    tier: int = Query(None),
    view: str = Query("mine"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    query = select(Signal)
    count_query = select(func.count(Signal.id))

    # Role-based visibility scoping
    if current_user:
        if current_user.role == 'rep' and view not in ('mine',):
            view = 'mine'
        elif current_user.role == 'manager' and view not in ('mine', 'team'):
            view = 'team'

        visible_ids = await get_visible_account_ids(current_user, view, db)
        if visible_ids is not None:
            query = query.where(Signal.account_id.in_(visible_ids))
            count_query = count_query.where(Signal.account_id.in_(visible_ids))

    if account_id:
        query = query.where(Signal.account_id == account_id)
        count_query = count_query.where(Signal.account_id == account_id)
    if source:
        query = query.where(Signal.source == source)
        count_query = count_query.where(Signal.source == source)
    if heat:
        query = query.where(Signal.heat == heat)
        count_query = count_query.where(Signal.heat == heat)
    if status:
        query = query.where(Signal.status == status)
        count_query = count_query.where(Signal.status == status)
    has_account_join = False
    if tier is not None:
        # Join to Account to filter by tier
        query = query.join(Account).where(Account.tier == tier)
        count_query = count_query.join(Account).where(Account.tier == tier)
        has_account_join = True

    # --- Signal Gate filtering ---
    gates_result = await db.execute(
        select(SignalGate).where(SignalGate.enabled == True)
    )
    enabled_gates = gates_result.scalars().all()

    if enabled_gates:
        gate_clauses = []
        needs_account_join = False

        for gate in enabled_gates:
            conds = gate.conditions or {}
            parts = []

            if conds.get('states'):
                parts.append(Signal.location_state.in_(conds['states']))
            if conds.get('sources'):
                parts.append(Signal.source.in_(conds['sources']))
            if conds.get('min_value') is not None:
                parts.append(Signal.project_value >= conds['min_value'])
            if conds.get('max_value') is not None:
                parts.append(Signal.project_value <= conds['max_value'])
            if conds.get('segments'):
                needs_account_join = True
                parts.append(Account.segment.in_(conds['segments']))
            if conds.get('min_employee_count') is not None:
                needs_account_join = True
                parts.append(Account.employee_count >= conds['min_employee_count'])
            if conds.get('max_employee_count') is not None:
                needs_account_join = True
                parts.append(Account.employee_count <= conds['max_employee_count'])

            if parts:
                gate_clauses.append(and_(*parts))

        if gate_clauses:
            if needs_account_join and not has_account_join:
                query = query.join(Account)
                count_query = count_query.join(Account)
            combined = or_(*gate_clauses)
            query = query.where(combined)
            count_query = count_query.where(combined)

    total = (await db.execute(count_query)).scalar() or 0
    result = await db.execute(
        query.order_by(Signal.detected_at.desc()).offset(offset).limit(limit)
    )
    items = [SignalRead.model_validate(s) for s in result.scalars().all()]
    return PaginatedResponse(items=items, total=total, offset=offset, limit=limit)


@router.get("/{signal_id}", response_model=SignalRead)
async def get_signal(signal_id: str, db: AsyncSession = Depends(get_db)):
    signal = await db.scalar(select(Signal).where(Signal.id == signal_id))
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    return SignalRead.model_validate(signal)


@router.patch("/{signal_id}/status", response_model=SignalRead)
async def update_signal_status(
    signal_id: str,
    data: SignalStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    signal = await db.scalar(select(Signal).where(Signal.id == signal_id))
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    if data.status not in ('new', 'viewed', 'actioned', 'dismissed'):
        raise HTTPException(status_code=400, detail="Invalid status")
    signal.status = data.status
    await db.commit()
    await db.refresh(signal)
    return SignalRead.model_validate(signal)


@router.post("", response_model=SignalRead, status_code=201)
async def create_signal(data: SignalCreate, db: AsyncSession = Depends(get_db)):
    account = await db.scalar(
        select(Account).where(Account.id == data.account_id)
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    signal = Signal(
        account_id=data.account_id,
        source=data.source,
        signal_type=data.signal_type,
        heat=data.heat,
        title=data.title,
        detail=data.detail,
        score_contribution=data.score_contribution,
        location_city=data.location_city,
        location_state=data.location_state,
    )
    db.add(signal)
    await db.commit()
    await db.refresh(signal)
    return SignalRead.model_validate(signal)
