from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import datetime, timezone, timedelta

from packages.db.session import get_db
from packages.db.models import Signal, Account, User
from packages.ai.claude import interpret_search_query, summarize_search_results
from services.api.schemas import SignalRead
from services.api.auth import get_current_user

router = APIRouter(prefix="/api/ai", tags=["ai"])


class SearchRequest(BaseModel):
    query: str


class SearchResponse(BaseModel):
    message: str
    signals: list
    filters_used: dict


@router.post("/search", response_model=SearchResponse)
async def ai_search(
    req: SearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    # Step 1: Interpret the query into structured filters
    filters = await interpret_search_query(req.query)

    # Step 2: Build SQL query from filters
    query = select(Signal, Account.name.label("account_name")).join(
        Account, Signal.account_id == Account.id
    )
    conditions = []

    if filters.get("source"):
        conditions.append(Signal.source == filters["source"])
    if filters.get("heat"):
        conditions.append(Signal.heat == filters["heat"])
    if filters.get("status"):
        conditions.append(Signal.status == filters["status"])
    if filters.get("location_state"):
        conditions.append(Signal.location_state == filters["location_state"])
    if filters.get("location_city"):
        conditions.append(Signal.location_city.ilike(f"%{filters['location_city']}%"))
    if filters.get("search_text"):
        text = f"%{filters['search_text']}%"
        conditions.append(
            (Signal.title.ilike(text)) | (Signal.detail.ilike(text))
        )
    if filters.get("min_value"):
        conditions.append(Signal.project_value >= filters["min_value"])
    if filters.get("date_range_days"):
        cutoff = datetime.now(timezone.utc) - timedelta(days=filters["date_range_days"])
        conditions.append(Signal.detected_at >= cutoff)

    if conditions:
        query = query.where(and_(*conditions))

    limit = min(filters.get("limit", 20), 50)
    query = query.order_by(Signal.detected_at.desc()).limit(limit)

    result = await db.execute(query)
    rows = result.all()

    # Build response data
    signals_data = []
    for row in rows:
        signal = row[0]
        account_name = row[1]
        signal_dict = SignalRead.model_validate(signal).model_dump()
        signal_dict["account_name"] = account_name
        signals_data.append(signal_dict)

    # Step 3: Get AI summary
    message = await summarize_search_results(req.query, signals_data, [])

    return SearchResponse(
        message=message,
        signals=signals_data,
        filters_used=filters,
    )
