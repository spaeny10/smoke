from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from packages.db.session import get_db
from packages.db.models import Contact, Account
from services.api.schemas import (
    ContactCreate, ContactUpdate, ContactRead, PaginatedResponse,
)

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


@router.get("", response_model=PaginatedResponse[ContactRead])
async def list_contacts(
    search: str = Query(None),
    account_id: str = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    query = select(Contact)
    count_query = select(func.count(Contact.id))

    if search:
        query = query.where(Contact.name.ilike(f"%{search}%"))
        count_query = count_query.where(Contact.name.ilike(f"%{search}%"))
    if account_id:
        query = query.where(Contact.account_id == account_id)
        count_query = count_query.where(Contact.account_id == account_id)

    total = (await db.execute(count_query)).scalar() or 0
    result = await db.execute(
        query.order_by(Contact.created_at.desc()).offset(offset).limit(limit)
    )
    contacts = result.scalars().all()

    # Batch-fetch account names for display
    acct_ids = list({c.account_id for c in contacts if c.account_id})
    acct_names: dict[str, str] = {}
    if acct_ids:
        acct_result = await db.execute(
            select(Account.id, Account.name).where(Account.id.in_(acct_ids))
        )
        acct_names = {str(row.id): row.name for row in acct_result.all()}

    items = []
    for c in contacts:
        read = ContactRead.model_validate(c)
        read.account_name = acct_names.get(c.account_id)
        items.append(read)

    return PaginatedResponse(items=items, total=total, offset=offset, limit=limit)


@router.get("/{contact_id}", response_model=ContactRead)
async def get_contact(contact_id: str, db: AsyncSession = Depends(get_db)):
    contact = await db.scalar(select(Contact).where(Contact.id == contact_id))
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    read = ContactRead.model_validate(contact)
    if contact.account_id:
        account = await db.scalar(
            select(Account).where(Account.id == contact.account_id)
        )
        if account:
            read.account_name = account.name
    return read


@router.post("", response_model=ContactRead, status_code=201)
async def create_contact(data: ContactCreate, db: AsyncSession = Depends(get_db)):
    account = await db.scalar(
        select(Account).where(Account.id == data.account_id)
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    contact = Contact(
        account_id=data.account_id,
        name=data.name,
        title=data.title,
        role_category=data.role_category,
        email=data.email,
        phone=data.phone,
        linkedin_url=data.linkedin_url,
        source=data.source,
    )
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    read = ContactRead.model_validate(contact)
    read.account_name = account.name
    return read


@router.put("/{contact_id}", response_model=ContactRead)
async def update_contact(
    contact_id: str, data: ContactUpdate, db: AsyncSession = Depends(get_db)
):
    contact = await db.scalar(select(Contact).where(Contact.id == contact_id))
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(contact, key, value)
    await db.commit()
    await db.refresh(contact)
    read = ContactRead.model_validate(contact)
    if contact.account_id:
        account = await db.scalar(
            select(Account).where(Account.id == contact.account_id)
        )
        if account:
            read.account_name = account.name
    return read


@router.delete("/{contact_id}", status_code=204)
async def delete_contact(contact_id: str, db: AsyncSession = Depends(get_db)):
    contact = await db.scalar(select(Contact).where(Contact.id == contact_id))
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    await db.delete(contact)
    await db.commit()
