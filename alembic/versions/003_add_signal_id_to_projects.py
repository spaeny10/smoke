"""Add signal_id FK to projects table

Revision ID: 003
Revises: 002
Create Date: 2026-03-13

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '003'
down_revision: Union[str, None] = '002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == 'postgresql':
        op.execute("ALTER TABLE projects ADD COLUMN IF NOT EXISTS signal_id VARCHAR REFERENCES signals(id) ON DELETE SET NULL")
    else:
        # SQLite
        conn = op.get_bind()
        result = conn.execute(sa.text("PRAGMA table_info(projects)"))
        existing_cols = {row[1] for row in result}
        if 'signal_id' not in existing_cols:
            with op.batch_alter_table('projects') as batch_op:
                batch_op.add_column(sa.Column('signal_id', sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('projects') as batch_op:
        batch_op.drop_column('signal_id')
