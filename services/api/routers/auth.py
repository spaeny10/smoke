from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from packages.db.session import get_db
from packages.db.models import User
from services.api.schemas import (
    RegisterRequest, LoginRequest, TokenResponse, UserRead,
)
from services.api.auth import (
    hash_password, verify_password, create_access_token, require_auth,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.scalar(select(User).where(User.email == data.email))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    user = User(
        email=data.email,
        name=data.name,
        password_hash=hash_password(data.password),
        team_id=data.team_id,
        role=data.role or "rep",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_access_token({"sub": user.id, "team_id": user.team_id})
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == data.email))
    if not user or not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_access_token({"sub": user.id, "team_id": user.team_id})
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserRead)
async def get_me(user: User = Depends(require_auth)):
    return UserRead.model_validate(user)
