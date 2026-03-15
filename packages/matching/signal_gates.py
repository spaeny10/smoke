"""Signal gate enforcement — check if a signal passes at least one enabled gate."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def load_enabled_gates(db: AsyncSession) -> list[dict]:
    """Load all enabled signal gates and return their conditions dicts."""
    from packages.db.models import SignalGate

    result = await db.execute(
        select(SignalGate.conditions).where(SignalGate.enabled == True)
    )
    return [row.conditions for row in result.all() if row.conditions]


def signal_passes_gates(
    gates: list[dict],
    *,
    location_state: str | None = None,
    source: str | None = None,
    project_value: float | None = None,
    account_segment: str | None = None,
    account_employee_count: int | None = None,
) -> bool:
    """
    Check if a signal passes at least one enabled gate.

    - No gates exist → all signals pass (no filtering active).
    - Within a gate, all non-null conditions must match (AND).
    - Across gates, any match is sufficient (OR).
    """
    if not gates:
        return True

    for conditions in gates:
        if _matches_gate(
            conditions,
            location_state=location_state,
            source=source,
            project_value=project_value,
            account_segment=account_segment,
            account_employee_count=account_employee_count,
        ):
            return True

    return False


def _matches_gate(
    conditions: dict,
    *,
    location_state: str | None,
    source: str | None,
    project_value: float | None,
    account_segment: str | None,
    account_employee_count: int | None,
) -> bool:
    """Check if signal+account match ALL conditions in a single gate."""

    # States filter
    states = conditions.get("states")
    if states:
        if not location_state or location_state not in states:
            return False

    # Sources filter
    sources = conditions.get("sources")
    if sources:
        if not source or source not in sources:
            return False

    # Value range
    min_val = conditions.get("min_value")
    if min_val is not None:
        if project_value is None or project_value < min_val:
            return False

    max_val = conditions.get("max_value")
    if max_val is not None:
        if project_value is None or project_value > max_val:
            return False

    # Segments filter
    segments = conditions.get("segments")
    if segments:
        if not account_segment or account_segment not in segments:
            return False

    # Employee count range
    min_emp = conditions.get("min_employee_count")
    if min_emp is not None:
        if account_employee_count is None or account_employee_count < min_emp:
            return False

    max_emp = conditions.get("max_employee_count")
    if max_emp is not None:
        if account_employee_count is None or account_employee_count > max_emp:
            return False

    return True


async def enforce_signal_gates(db: AsyncSession) -> int:
    """
    Retroactively delete existing signals that don't pass any enabled gate.

    If no gates are enabled, does nothing (returns 0).
    Returns the number of signals removed.
    """
    from packages.db.models import Signal, Account

    gates = await load_enabled_gates(db)
    if not gates:
        return 0

    result = await db.execute(
        select(Signal, Account.segment, Account.employee_count)
        .join(Account, Signal.account_id == Account.id)
    )
    rows = result.all()

    removed = 0
    for signal, segment, employee_count in rows:
        if not signal_passes_gates(
            gates,
            location_state=signal.location_state,
            source=signal.source,
            project_value=signal.project_value,
            account_segment=segment,
            account_employee_count=employee_count,
        ):
            await db.delete(signal)
            removed += 1

    if removed:
        await db.commit()
        logger.info(f"Signal gate enforcement removed {removed} signals")

    return removed
