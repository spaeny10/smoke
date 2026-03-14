from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from packages.db.session import get_db
from packages.db.models import User
from services.api.schemas import (
    RegisterRequest, LoginRequest, GoogleAuthRequest, TokenResponse, UserRead,
)
from services.api.auth import (
    hash_password, verify_password, create_access_token, require_auth,
    GOOGLE_CLIENT_ID, ALLOWED_EMAIL_DOMAINS,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    domain = data.email.split("@")[1].lower() if "@" in data.email else ""
    if domain not in ALLOWED_EMAIL_DOMAINS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is restricted to authorized domains.",
        )
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


@router.post("/google", response_model=TokenResponse)
async def google_auth(data: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    """Verify a Google ID token and return a Smoke JWT."""
    try:
        idinfo = google_id_token.verify_oauth2_token(
            data.credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Google auth failed: {type(e).__name__}: {e}",
        )

    google_id = idinfo["sub"]
    email = idinfo["email"]
    name = idinfo.get("name", email.split("@")[0])

    # Domain restriction
    domain = email.split("@")[1].lower()
    if domain not in ALLOWED_EMAIL_DOMAINS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Sign-in is restricted to authorized domains.",
        )

    # 1. Look up by google_id
    user = await db.scalar(select(User).where(User.google_id == google_id))

    if not user:
        # 2. Look up by email (account linking)
        user = await db.scalar(select(User).where(User.email == email))
        if user:
            user.google_id = google_id
            if not user.name or user.name == email:
                user.name = name
        else:
            # 3. Create new user
            user = User(
                email=email,
                name=name,
                google_id=google_id,
                role="rep",
            )
            db.add(user)

    try:
        await db.commit()
        await db.refresh(user)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {type(e).__name__}: {e}",
        )

    token = create_access_token({"sub": user.id, "team_id": user.team_id})
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserRead)
async def get_me(user: User = Depends(require_auth)):
    return UserRead.model_validate(user)
