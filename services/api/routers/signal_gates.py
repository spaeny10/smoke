import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from packages.db.session import get_db
from packages.db.models import SignalGate, User
from packages.matching.signal_gates import enforce_signal_gates
from services.api.schemas import SignalGateCreate, SignalGateUpdate, SignalGateRead
from services.api.auth import require_auth, require_director

router = APIRouter(prefix="/api/signal-gates", tags=["signal-gates"])
logger = logging.getLogger(__name__)


@router.get("", response_model=List[SignalGateRead])
async def list_gates(
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SignalGate).order_by(SignalGate.created_at.desc())
    )
    return [SignalGateRead.model_validate(g) for g in result.scalars().all()]


@router.post("", response_model=SignalGateRead, status_code=201)
async def create_gate(
    data: SignalGateCreate,
    user: User = Depends(require_director),
    db: AsyncSession = Depends(get_db),
):
    gate = SignalGate(
        name=data.name,
        description=data.description,
        conditions=data.conditions.model_dump(exclude_none=True),
        enabled=data.enabled if data.enabled is not None else True,
        created_by=user.id,
    )
    db.add(gate)
    await db.commit()
    await db.refresh(gate)

    # Enforce gates on existing signals
    removed = await enforce_signal_gates(db)
    logger.info(f"Gate created '{data.name}', enforced: {removed} signals removed")

    return SignalGateRead.model_validate(gate)


@router.put("/{gate_id}", response_model=SignalGateRead)
async def update_gate(
    gate_id: str,
    data: SignalGateUpdate,
    user: User = Depends(require_director),
    db: AsyncSession = Depends(get_db),
):
    gate = await db.scalar(select(SignalGate).where(SignalGate.id == gate_id))
    if not gate:
        raise HTTPException(status_code=404, detail="Gate not found")

    update_data = data.model_dump(exclude_unset=True)

    if 'conditions' in update_data and data.conditions is not None:
        update_data['conditions'] = data.conditions.model_dump(exclude_none=True)

    for key, value in update_data.items():
        setattr(gate, key, value)

    await db.commit()
    await db.refresh(gate)

    # Enforce gates on existing signals
    removed = await enforce_signal_gates(db)
    logger.info(f"Gate updated '{gate.name}', enforced: {removed} signals removed")

    return SignalGateRead.model_validate(gate)


@router.delete("/{gate_id}", status_code=204)
async def delete_gate(
    gate_id: str,
    user: User = Depends(require_director),
    db: AsyncSession = Depends(get_db),
):
    gate = await db.scalar(select(SignalGate).where(SignalGate.id == gate_id))
    if not gate:
        raise HTTPException(status_code=404, detail="Gate not found")
    await db.delete(gate)
    await db.commit()

    # Enforce gates on existing signals (remaining gates may now filter differently)
    removed = await enforce_signal_gates(db)
    logger.info(f"Gate deleted, enforced: {removed} signals removed")


@router.post("/enforce")
async def enforce_gates(
    user: User = Depends(require_director),
    db: AsyncSession = Depends(get_db),
):
    """Manually trigger gate enforcement — removes all signals that don't match any enabled gate."""
    removed = await enforce_signal_gates(db)
    return {"removed": removed, "message": f"Removed {removed} signals that didn't match any enabled gate"}
