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

        results = {}

        # Count signals before each pipeline to measure new ones
        from packages.db.session import async_session

        async with async_session() as db:
            before = (await db.execute(select(func.count(Signal.id)))).scalar() or 0

        await fetch_permit_data()
        async with async_session() as db:
            after_permits = (await db.execute(select(func.count(Signal.id)))).scalar() or 0
        results["permits"] = after_permits - before

        await fetch_contract_data()
        async with async_session() as db:
            after_contracts = (await db.execute(select(func.count(Signal.id)))).scalar() or 0
        results["contracts"] = after_contracts - after_permits

        await fetch_news_data()
        async with async_session() as db:
            after_news = (await db.execute(select(func.count(Signal.id)))).scalar() or 0
        results["news"] = after_news - after_contracts

        await fetch_osha_data()
        async with async_session() as db:
            after_osha = (await db.execute(select(func.count(Signal.id)))).scalar() or 0
        results["osha"] = after_osha - after_news

        results["total_new"] = after_osha - before

        _scan_state["last_result"] = results
        _scan_state["last_run"] = datetime.now(timezone.utc).isoformat()
        logger.info(f"Pipeline scan complete: {results}")

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
