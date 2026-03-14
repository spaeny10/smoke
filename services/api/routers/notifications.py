from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update

from packages.db.session import get_db
from packages.db.models import Notification, User
from services.api.schemas import NotificationRead
from services.api.auth import require_auth

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


async def create_notification(
    db: AsyncSession, user_id: str, title: str, body: str = None, link: str = None
):
    """Helper to create a notification for a user."""
    notif = Notification(user_id=user_id, title=title, body=body, link=link)
    db.add(notif)
    return notif


@router.get("", response_model=list[NotificationRead])
async def list_notifications(
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(30)
    )
    return [NotificationRead.model_validate(n) for n in result.scalars().all()]


@router.get("/unread-count")
async def unread_count(
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == user.id, Notification.read == False
        )
    )
    return {"count": result.scalar() or 0}


@router.patch("/{notification_id}/read", response_model=NotificationRead)
async def mark_read(
    notification_id: str,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    notif = await db.scalar(
        select(Notification).where(
            Notification.id == notification_id, Notification.user_id == user.id
        )
    )
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.read = True
    await db.commit()
    await db.refresh(notif)
    return NotificationRead.model_validate(notif)


@router.post("/read-all")
async def mark_all_read(
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read == False)
        .values(read=True)
    )
    await db.commit()
    return {"status": "ok"}
