import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from packages.db.session import get_db
from packages.db.models import Signal, Account, User, ScheduleConfig
from services.api.schemas import ScheduleConfigRead, ScheduleConfigUpdate
from services.api.auth import require_director

router = APIRouter(prefix="/api/pipelines", tags=["pipelines"])

logger = logging.getLogger(__name__)

# Simple in-memory scan state (single-instance; fine for this app)
_scan_state = {
    "running": False,
    "last_run": None,
    "last_result": None,
    "error": None,
}


async def _auto_dedup_signals() -> int:
    """Remove duplicate signals (same source + title per account). Returns count removed."""
    from packages.db.session import async_session as _async_session
    async with _async_session() as db:
        result = await db.execute(
            select(Signal.account_id, Signal.source, Signal.title, func.count(Signal.id).label("cnt"))
            .group_by(Signal.account_id, Signal.source, Signal.title)
            .having(func.count(Signal.id) > 1)
        )
        dup_groups = result.all()
        removed = 0
        for row in dup_groups:
            dupes = (await db.execute(
                select(Signal)
                .where(Signal.account_id == row[0], Signal.source == row[1], Signal.title == row[2])
                .order_by(Signal.detected_at.desc())
            )).scalars().all()
            # Keep the newest, delete the rest
            for dup in dupes[1:]:
                await db.delete(dup)
                removed += 1
        await db.commit()
    return removed


async def _run_pipelines():
    """Run all signal pipelines and update scan state."""
    global _scan_state
    _scan_state["running"] = True
    _scan_state["error"] = None

    try:
        from services.pipeline_permits.main import fetch_permit_data
        from services.pipeline_contracts.main import fetch_contract_data
        from services.pipeline_news.main import fetch_news_data
        from services.pipeline_osha.main import fetch_osha_data
        from services.pipeline_jobtitles.main import fetch_jobtitle_data
        from services.pipeline_sam.main import fetch_sam_data
        from services.pipeline_fema.main import fetch_fema_data
        from services.pipeline_sec.main import fetch_sec_data
        from services.pipeline_epa.main import fetch_epa_data
        from services.pipeline_procore.main import fetch_procore_data

        results = {}

        # Count signals before each pipeline to measure new ones
        from packages.db.session import async_session

        async def _count() -> int:
            async with async_session() as db:
                return (await db.execute(select(func.count(Signal.id)))).scalar() or 0

        before = await _count()

        await fetch_permit_data()
        after_permits = await _count()
        results["permits"] = after_permits - before

        await fetch_contract_data()
        after_contracts = await _count()
        results["contracts"] = after_contracts - after_permits

        await fetch_news_data()
        after_news = await _count()
        results["news"] = after_news - after_contracts

        await fetch_osha_data()
        after_osha = await _count()
        results["osha"] = after_osha - after_news

        await fetch_jobtitle_data()
        after_jobtitles = await _count()
        results["jobtitles"] = after_jobtitles - after_osha

        await fetch_sam_data()
        after_sam = await _count()
        results["sam"] = after_sam - after_jobtitles

        await fetch_fema_data()
        after_fema = await _count()
        results["fema"] = after_fema - after_sam

        await fetch_sec_data()
        after_sec = await _count()
        results["sec"] = after_sec - after_fema

        await fetch_epa_data()
        after_epa = await _count()
        results["epa"] = after_epa - after_sec

        await fetch_procore_data()
        after_procore = await _count()
        results["procore"] = after_procore - after_epa

        results["total_new"] = after_procore - before

        _scan_state["last_result"] = results
        _scan_state["last_run"] = datetime.now(timezone.utc).isoformat()
        logger.info(f"Pipeline scan complete: {results}")

        # Auto-dedup signals after pipeline scan
        if results["total_new"] > 0:
            try:
                deduped = await _auto_dedup_signals()
                results["auto_deduped"] = deduped
                logger.info(f"Auto-dedup removed {deduped} duplicate signals")
            except Exception as dedup_err:
                logger.warning(f"Auto-dedup failed: {dedup_err}")

        # Enforce signal gates on all signals (clean up any that slipped through or pre-date gates)
        try:
            from packages.matching.signal_gates import enforce_signal_gates
            async with async_session() as db:
                gated = await enforce_signal_gates(db)
            results["gate_enforced"] = gated
            if gated:
                logger.info(f"Gate enforcement removed {gated} signals")
        except Exception as gate_err:
            logger.warning(f"Gate enforcement failed: {gate_err}")

    except Exception as e:
        _scan_state["error"] = str(e)
        logger.exception("Pipeline scan failed")
    finally:
        _scan_state["running"] = False


@router.post("/run")
async def run_pipelines(user: User = Depends(require_director)):
    """Trigger all signal pipelines. Director only. Runs in background."""
    if _scan_state["running"]:
        raise HTTPException(status_code=409, detail="A scan is already running")

    # Fire and forget — run pipelines in background
    asyncio.create_task(_run_pipelines())

    return {"status": "started", "message": "Signal scan started. Check /api/pipelines/status for progress."}


@router.get("/status")
async def pipeline_status(user: User = Depends(require_director)):
    """Check the current scan status."""
    return {
        "running": _scan_state["running"],
        "last_run": _scan_state["last_run"],
        "last_result": _scan_state["last_result"],
        "error": _scan_state["error"],
    }


@router.get("/schedule")
async def get_schedule(
    user: User = Depends(require_director),
    db: AsyncSession = Depends(get_db),
):
    config = await db.scalar(
        select(ScheduleConfig).where(ScheduleConfig.task_name == "pipeline_scan")
    )
    if not config:
        return {"id": None, "task_name": "pipeline_scan", "cron_expression": "0 6 * * *", "enabled": False, "last_triggered": None}
    return ScheduleConfigRead.model_validate(config)


@router.put("/schedule")
async def update_schedule(
    data: ScheduleConfigUpdate,
    user: User = Depends(require_director),
    db: AsyncSession = Depends(get_db),
):
    config = await db.scalar(
        select(ScheduleConfig).where(ScheduleConfig.task_name == "pipeline_scan")
    )
    if not config:
        config = ScheduleConfig(
            task_name="pipeline_scan",
            cron_expression=data.cron_expression or "0 6 * * *",
            enabled=data.enabled if data.enabled is not None else False,
            created_by=user.id,
        )
        db.add(config)
    else:
        if data.cron_expression is not None:
            config.cron_expression = data.cron_expression
        if data.enabled is not None:
            config.enabled = data.enabled
    await db.commit()
    await db.refresh(config)
    return ScheduleConfigRead.model_validate(config)
