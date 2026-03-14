from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from packages.db.session import get_db
from packages.db.models import Project, Account
from services.api.schemas import (
    ProjectCreate, ProjectUpdate, ProjectRead, PaginatedResponse,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=PaginatedResponse[ProjectRead])
async def list_projects(
    search: str = Query(None),
    stage: str = Query(None),
    account_id: str = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    query = select(Project)
    count_query = select(func.count(Project.id))

    if search:
        query = query.where(Project.name.ilike(f"%{search}%"))
        count_query = count_query.where(Project.name.ilike(f"%{search}%"))
    if stage:
        query = query.where(Project.stage == stage)
        count_query = count_query.where(Project.stage == stage)
    if account_id:
        query = query.where(Project.account_id == account_id)
        count_query = count_query.where(Project.account_id == account_id)

    total = (await db.execute(count_query)).scalar() or 0
    result = await db.execute(
        query.order_by(Project.updated_at.desc()).offset(offset).limit(limit)
    )
    projects = result.scalars().all()

    # Batch-fetch account names
    acct_ids = list({p.account_id for p in projects if p.account_id})
    acct_names: dict[str, str] = {}
    if acct_ids:
        acct_result = await db.execute(
            select(Account.id, Account.name).where(Account.id.in_(acct_ids))
        )
        acct_names = {str(row.id): row.name for row in acct_result.all()}

    items = []
    for p in projects:
        read = ProjectRead.model_validate(p)
        read.account_name = acct_names.get(p.account_id)
        items.append(read)

    return PaginatedResponse(items=items, total=total, offset=offset, limit=limit)


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    project = await db.scalar(select(Project).where(Project.id == project_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    read = ProjectRead.model_validate(project)
    if project.account_id:
        account = await db.scalar(
            select(Account).where(Account.id == project.account_id)
        )
        if account:
            read.account_name = account.name
    return read


@router.post("", response_model=ProjectRead, status_code=201)
async def create_project(data: ProjectCreate, db: AsyncSession = Depends(get_db)):
    account = await db.scalar(
        select(Account).where(Account.id == data.account_id)
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    project = Project(
        account_id=data.account_id,
        name=data.name,
        description=data.description,
        primary_contact_id=data.primary_contact_id,
        signal_id=data.signal_id,
        stage=data.stage,
        origin=data.origin,
        estimated_value=data.estimated_value,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    read = ProjectRead.model_validate(project)
    read.account_name = account.name
    return read


@router.put("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: str, data: ProjectUpdate, db: AsyncSession = Depends(get_db)
):
    project = await db.scalar(select(Project).where(Project.id == project_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(project, key, value)
    await db.commit()
    await db.refresh(project)
    read = ProjectRead.model_validate(project)
    if project.account_id:
        account = await db.scalar(
            select(Account).where(Account.id == project.account_id)
        )
        if account:
            read.account_name = account.name
    return read


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    project = await db.scalar(select(Project).where(Project.id == project_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.delete(project)
    await db.commit()
