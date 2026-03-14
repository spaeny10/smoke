"""Add website column to accounts table

Revision ID: 004
Revises: 003
Create Date: 2026-03-14

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '004'
down_revision: Union[str, None] = '003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == 'postgresql':
        op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS website VARCHAR")
    else:
        # SQLite
        conn = op.get_bind()
        result = conn.execute(sa.text("PRAGMA table_info(accounts)"))
        existing_cols = {row[1] for row in result}
        if 'website' not in existing_cols:
            with op.batch_alter_table('accounts') as batch_op:
                batch_op.add_column(sa.Column('website', sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('accounts') as batch_op:
        batch_op.drop_column('website')
