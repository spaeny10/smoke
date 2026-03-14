from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from packages.db.session import get_db
from packages.db.models import OutreachSequence, SequenceEnrollment, User
from services.api.schemas import (
    SequenceCreate, SequenceRead,
    EnrollmentCreate, EnrollmentRead, EnrollmentUpdate,
)
from services.api.auth import require_auth

router = APIRouter(prefix="/api/sequences", tags=["sequences"])


@router.get("", response_model=list[SequenceRead])
async def list_sequences(
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OutreachSequence).order_by(OutreachSequence.created_at.desc())
    )
    return [SequenceRead.model_validate(s) for s in result.scalars().all()]


@router.post("", response_model=SequenceRead, status_code=201)
async def create_sequence(
    data: SequenceCreate,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    seq = OutreachSequence(
        name=data.name,
        steps=[s.model_dump() for s in data.steps],
        created_by=user.id,
    )
    db.add(seq)
    await db.commit()
    await db.refresh(seq)
    return SequenceRead.model_validate(seq)


@router.get("/{sequence_id}")
async def get_sequence(
    sequence_id: str,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    seq = await db.scalar(
        select(OutreachSequence).where(OutreachSequence.id == sequence_id)
    )
    if not seq:
        raise HTTPException(status_code=404, detail="Sequence not found")

    enrollment_count = (await db.execute(
        select(func.count(SequenceEnrollment.id))
        .where(SequenceEnrollment.sequence_id == sequence_id)
    )).scalar() or 0

    active_count = (await db.execute(
        select(func.count(SequenceEnrollment.id))
        .where(SequenceEnrollment.sequence_id == sequence_id, SequenceEnrollment.status == 'active')
    )).scalar() or 0

    return {
        **SequenceRead.model_validate(seq).model_dump(),
        "enrollment_count": enrollment_count,
        "active_count": active_count,
    }


@router.delete("/{sequence_id}", status_code=204)
async def delete_sequence(
    sequence_id: str,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    seq = await db.scalar(
        select(OutreachSequence).where(OutreachSequence.id == sequence_id)
    )
    if not seq:
        raise HTTPException(status_code=404, detail="Sequence not found")
    await db.delete(seq)
    await db.commit()


@router.post("/{sequence_id}/enroll", response_model=EnrollmentRead, status_code=201)
async def enroll_contact(
    sequence_id: str,
    data: EnrollmentCreate,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    seq = await db.scalar(
        select(OutreachSequence).where(OutreachSequence.id == sequence_id)
    )
    if not seq:
        raise HTTPException(status_code=404, detail="Sequence not found")

    enrollment = SequenceEnrollment(
        sequence_id=sequence_id,
        contact_id=data.contact_id,
        account_id=data.account_id,
        current_step=1,
        status='active',
    )
    db.add(enrollment)
    await db.commit()
    await db.refresh(enrollment)
    return EnrollmentRead.model_validate(enrollment)


@router.get("/{sequence_id}/enrollments", response_model=list[EnrollmentRead])
async def list_enrollments(
    sequence_id: str,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SequenceEnrollment)
        .where(SequenceEnrollment.sequence_id == sequence_id)
        .order_by(SequenceEnrollment.created_at.desc())
    )
    return [EnrollmentRead.model_validate(e) for e in result.scalars().all()]


@router.patch("/enrollments/{enrollment_id}", response_model=EnrollmentRead)
async def update_enrollment(
    enrollment_id: str,
    data: EnrollmentUpdate,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    enrollment = await db.scalar(
        select(SequenceEnrollment).where(SequenceEnrollment.id == enrollment_id)
    )
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    if data.status is not None:
        enrollment.status = data.status
    await db.commit()
    await db.refresh(enrollment)
    return EnrollmentRead.model_validate(enrollment)
