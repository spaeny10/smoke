from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List

from packages.db.session import get_db
from packages.db.models import Team, User
from services.api.schemas import TeamCreate, TeamRead, TeamWithMembers, UserRead
from services.api.auth import require_auth, require_director

router = APIRouter(prefix="/api/teams", tags=["teams"])


@router.get("", response_model=List[TeamWithMembers])
async def list_teams(
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Team).options(selectinload(Team.members)).order_by(Team.name)
    )
    teams = result.scalars().unique().all()
    items = []
    for t in teams:
        team_data = TeamWithMembers.model_validate(t)
        team_data.members = [UserRead.model_validate(m) for m in t.members]
        items.append(team_data)
    return items


@router.post("", response_model=TeamRead, status_code=201)
async def create_team(
    data: TeamCreate,
    user: User = Depends(require_director),
    db: AsyncSession = Depends(get_db),
):
    team = Team(name=data.name)
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return TeamRead.model_validate(team)


@router.delete("/{team_id}", status_code=204)
async def delete_team(
    team_id: str,
    user: User = Depends(require_director),
    db: AsyncSession = Depends(get_db),
):
    team = await db.scalar(select(Team).where(Team.id == team_id))
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    members_result = await db.execute(
        select(User).where(User.team_id == team_id)
    )
    for member in members_result.scalars().all():
        member.team_id = None
    await db.delete(team)
    await db.commit()
