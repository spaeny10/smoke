"""Add tier to accounts and status to signals

Revision ID: 001
Revises: None
Create Date: 2025-03-13

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == 'postgresql':
        # Use IF NOT EXISTS so migration is idempotent on PostgreSQL
        op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS tier INTEGER DEFAULT 3")
        op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS next_step_text VARCHAR")
        op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS next_step_due TIMESTAMPTZ")
        op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS next_step_assignee_id VARCHAR")

        op.execute("ALTER TABLE signals ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'new'")
        op.execute("ALTER TABLE signals ADD COLUMN IF NOT EXISTS project_name VARCHAR")
        op.execute("ALTER TABLE signals ADD COLUMN IF NOT EXISTS project_value FLOAT")
        op.execute("ALTER TABLE signals ADD COLUMN IF NOT EXISTS location_city VARCHAR")
        op.execute("ALTER TABLE signals ADD COLUMN IF NOT EXISTS location_state VARCHAR")
    else:
        # SQLite fallback using batch_alter_table
        with op.batch_alter_table('accounts') as batch_op:
            batch_op.add_column(sa.Column('tier', sa.Integer(), server_default='3'))
            batch_op.add_column(sa.Column('next_step_text', sa.String(), nullable=True))
            batch_op.add_column(sa.Column('next_step_due', sa.DateTime(timezone=True), nullable=True))
            batch_op.add_column(sa.Column('next_step_assignee_id', sa.String(), nullable=True))

        with op.batch_alter_table('signals') as batch_op:
            batch_op.add_column(sa.Column('status', sa.String(), server_default='new'))
            batch_op.add_column(sa.Column('project_name', sa.String(), nullable=True))
            batch_op.add_column(sa.Column('project_value', sa.Float(), nullable=True))
            batch_op.add_column(sa.Column('location_city', sa.String(), nullable=True))
            batch_op.add_column(sa.Column('location_state', sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('signals') as batch_op:
        batch_op.drop_column('status')
        batch_op.drop_column('project_name')
        batch_op.drop_column('project_value')
        batch_op.drop_column('location_city')
        batch_op.drop_column('location_state')

    with op.batch_alter_table('accounts') as batch_op:
        batch_op.drop_column('tier')
        batch_op.drop_column('next_step_text')
        batch_op.drop_column('next_step_due')
        batch_op.drop_column('next_step_assignee_id')
