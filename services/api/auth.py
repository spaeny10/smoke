import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.db.session import get_db
from packages.db.models import User, Account

SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dev-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Returns the current user if a valid token is provided, None otherwise."""
    if not credentials:
        return None
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if not user_id:
            return None
    except JWTError:
        return None
    user = await db.scalar(select(User).where(User.id == user_id))
    return user


async def require_auth(
    user: Optional[User] = Depends(get_current_user),
) -> User:
    """Strict version — raises 401 if no valid user."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def get_visible_account_ids(
    user: User, view: str, db: AsyncSession
) -> Optional[list]:
    """Returns list of account IDs the user can see, or None for 'all' (no filter)."""
    if user.role == 'director' and view == 'all':
        return None
    if user.role in ('director', 'manager') and view == 'team':
        team_reps = await db.execute(
            select(User.id).where(User.team_id == user.team_id)
        )
        rep_ids = [r[0] for r in team_reps.all()]
        accts = await db.execute(
            select(Account.id).where(Account.assigned_rep_id.in_(rep_ids))
        )
        return [a[0] for a in accts.all()]
    # Default: "mine" — only accounts assigned to this user
    accts = await db.execute(
        select(Account.id).where(Account.assigned_rep_id == user.id)
    )
    return [a[0] for a in accts.all()]
