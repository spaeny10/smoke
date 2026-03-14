from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from packages.db.session import get_db
from packages.db.models import Activity, Account, User
from services.api.schemas import ActivityCreate, ActivityRead, PaginatedResponse
from services.api.auth import require_auth

router = APIRouter(prefix="/api/activities", tags=["activities"])


@router.get("", response_model=PaginatedResponse[ActivityRead])
async def list_activities(
    account_id: str = Query(...),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    base = select(Activity).where(Activity.account_id == account_id)
    count_q = select(func.count(Activity.id)).where(Activity.account_id == account_id)

    total = (await db.execute(count_q)).scalar() or 0
    result = await db.execute(
        base.order_by(Activity.created_at.desc()).offset(offset).limit(limit)
    )
    items = [ActivityRead.model_validate(a) for a in result.scalars().all()]
    return PaginatedResponse(items=items, total=total, offset=offset, limit=limit)


@router.post("", response_model=ActivityRead, status_code=201)
async def create_activity(
    data: ActivityCreate,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    account = await db.scalar(select(Account).where(Account.id == data.account_id))
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    activity = Activity(
        account_id=data.account_id,
        contact_id=data.contact_id,
        user_id=user.id,
        channel=data.channel,
        direction=data.direction,
        summary=data.summary,
        is_auto_logged=False,
    )
    db.add(activity)
    await db.commit()
    await db.refresh(activity)
    return ActivityRead.model_validate(activity)
