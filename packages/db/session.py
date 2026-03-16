from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import inspect as sa_inspect, text
import os
import logging

from packages.db.models import Base

logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./construction_gtm.db")

# Railway provides postgresql:// but SQLAlchemy async needs postgresql+asyncpg://
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(DATABASE_URL, echo=False)

async_session = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


def _add_missing_columns(conn):
    """Add columns that create_all() won't add to existing tables."""
    inspector = sa_inspect(conn)
    existing_tables = inspector.get_table_names()

    # (table, column, SQL type)
    migrations = [
        ("contacts", "location_id", "VARCHAR"),
        ("contacts", "linkedin_url", "VARCHAR"),
        ("contacts", "email_verified", "BOOLEAN DEFAULT FALSE"),
        ("projects", "location_id", "VARCHAR"),
        ("projects", "primary_contact_id", "VARCHAR"),
        ("projects", "signal_id", "VARCHAR"),
        ("accounts", "next_step_text", "VARCHAR"),
        ("accounts", "next_step_due", "TIMESTAMP WITH TIME ZONE"),
        ("accounts", "next_step_assignee_id", "VARCHAR"),
        ("accounts", "hq_address", "VARCHAR"),
        ("accounts", "hq_zip", "VARCHAR"),
    ]

    for table, column, col_type in migrations:
        if table not in existing_tables:
            continue
        columns = [c["name"] for c in inspector.get_columns(table)]
        if column not in columns:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
            logger.info(f"Added missing column {table}.{column}")


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_add_missing_columns)

async def get_db():
    async with async_session() as session:
        yield session
