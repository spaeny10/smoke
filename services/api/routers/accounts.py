from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from packages.db.session import get_db
from packages.db.models import Account, Contact, Signal, Project
from packages.matching.utils import normalize_company_name
from services.api.schemas import (
    AccountCreate, AccountUpdate, AccountRead,
    ContactRead, SignalRead, ProjectRead,
    PaginatedResponse,
)

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


@router.get("", response_model=PaginatedResponse[AccountRead])
async def list_accounts(
    search: str = Query(None),
    segment: str = Query(None),
    deal_stage: str = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    query = select(Account)
    count_query = select(func.count(Account.id))

    if search:
        query = query.where(Account.name.ilike(f"%{search}%"))
        count_query = count_query.where(Account.name.ilike(f"%{search}%"))
    if segment:
        query = query.where(Account.segment == segment)
        count_query = count_query.where(Account.segment == segment)
    if deal_stage:
        query = query.where(Account.deal_stage == deal_stage)
        count_query = count_query.where(Account.deal_stage == deal_stage)

    total = (await db.execute(count_query)).scalar() or 0
    result = await db.execute(
        query.order_by(Account.updated_at.desc()).offset(offset).limit(limit)
    )
    items = [AccountRead.model_validate(a) for a in result.scalars().all()]
    return PaginatedResponse(items=items, total=total, offset=offset, limit=limit)


@router.get("/{account_id}", response_model=AccountRead)
async def get_account(account_id: str, db: AsyncSession = Depends(get_db)):
    account = await db.scalar(select(Account).where(Account.id == account_id))
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return AccountRead.model_validate(account)


@router.post("", response_model=AccountRead, status_code=201)
async def create_account(data: AccountCreate, db: AsyncSession = Depends(get_db)):
    account = Account(
        name=data.name,
        name_normalized=normalize_company_name(data.name),
        hq_city=data.hq_city,
        hq_state=data.hq_state,
        region=data.region,
        employee_count=data.employee_count,
        segment=data.segment,
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return AccountRead.model_validate(account)


@router.put("/{account_id}", response_model=AccountRead)
async def update_account(
    account_id: str, data: AccountUpdate, db: AsyncSession = Depends(get_db)
):
    account = await db.scalar(select(Account).where(Account.id == account_id))
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    update_data = data.model_dump(exclude_unset=True)
    if "name" in update_data:
        update_data["name_normalized"] = normalize_company_name(update_data["name"])
    for key, value in update_data.items():
        setattr(account, key, value)
    await db.commit()
    await db.refresh(account)
    return AccountRead.model_validate(account)


@router.delete("/{account_id}", status_code=204)
async def delete_account(account_id: str, db: AsyncSession = Depends(get_db)):
    account = await db.scalar(select(Account).where(Account.id == account_id))
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    await db.delete(account)
    await db.commit()


# ── Sub-resources ────────────────────────────────────────

@router.get("/{account_id}/contacts", response_model=list[ContactRead])
async def get_account_contacts(account_id: str, db: AsyncSession = Depends(get_db)):
    account = await db.scalar(select(Account).where(Account.id == account_id))
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    result = await db.execute(
        select(Contact).where(Contact.account_id == account_id)
    )
    contacts = result.scalars().all()
    items = []
    for c in contacts:
        read = ContactRead.model_validate(c)
        read.account_name = account.name
        items.append(read)
    return items


@router.get("/{account_id}/signals", response_model=list[SignalRead])
async def get_account_signals(account_id: str, db: AsyncSession = Depends(get_db)):
    account = await db.scalar(select(Account).where(Account.id == account_id))
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    result = await db.execute(
        select(Signal)
        .where(Signal.account_id == account_id)
        .order_by(Signal.detected_at.desc())
    )
    return [SignalRead.model_validate(s) for s in result.scalars().all()]


@router.get("/{account_id}/projects", response_model=list[ProjectRead])
async def get_account_projects(account_id: str, db: AsyncSession = Depends(get_db)):
    account = await db.scalar(select(Account).where(Account.id == account_id))
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    result = await db.execute(
        select(Project).where(Project.account_id == account_id)
    )
    projects = result.scalars().all()
    items = []
    for p in projects:
        read = ProjectRead.model_validate(p)
        read.account_name = account.name
        items.append(read)
    return items
