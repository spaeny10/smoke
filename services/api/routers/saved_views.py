from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from packages.db.session import get_db
from packages.db.models import SavedView, User
from services.api.schemas import SavedViewCreate, SavedViewRead
from services.api.auth import require_auth

router = APIRouter(prefix="/api/saved-views", tags=["saved-views"])


@router.get("", response_model=list[SavedViewRead])
async def list_saved_views(
    entity: str = Query("accounts"),
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SavedView)
        .where(SavedView.user_id == user.id, SavedView.entity == entity)
        .order_by(SavedView.created_at.desc())
    )
    return [SavedViewRead.model_validate(v) for v in result.scalars().all()]


@router.post("", response_model=SavedViewRead, status_code=201)
async def create_saved_view(
    data: SavedViewCreate,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    view = SavedView(
        user_id=user.id,
        name=data.name,
        entity=data.entity,
        filters=data.filters,
    )
    db.add(view)
    await db.commit()
    await db.refresh(view)
    return SavedViewRead.model_validate(view)


@router.delete("/{view_id}", status_code=204)
async def delete_saved_view(
    view_id: str,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    view = await db.scalar(
        select(SavedView).where(SavedView.id == view_id, SavedView.user_id == user.id)
    )
    if not view:
        raise HTTPException(status_code=404, detail="Saved view not found")
    await db.delete(view)
    await db.commit()
