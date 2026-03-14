from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from packages.db.session import get_db
from packages.db.models import User, Team
from services.api.schemas import UserRead, UserRoleUpdate
from services.api.auth import require_auth, require_director

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=List[UserRead])
async def list_users(
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).order_by(User.name))
    return [UserRead.model_validate(u) for u in result.scalars().all()]


@router.put("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: str,
    data: UserRoleUpdate,
    current_user: User = Depends(require_director),
    db: AsyncSession = Depends(get_db),
):
    target = await db.scalar(select(User).where(User.id == user_id))
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = data.model_dump(exclude_unset=True)

    if 'role' in update_data:
        valid_roles = ('rep', 'manager', 'director')
        if update_data['role'] not in valid_roles:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid role. Must be one of: {valid_roles}",
            )
        target.role = update_data['role']

    if 'team_id' in update_data:
        if update_data['team_id'] is not None:
            team = await db.scalar(
                select(Team).where(Team.id == update_data['team_id'])
            )
            if not team:
                raise HTTPException(status_code=404, detail="Team not found")
        target.team_id = update_data['team_id']

    await db.commit()
    await db.refresh(target)
    return UserRead.model_validate(target)
