"""Add missing columns to accounts/contacts and create new tables

Revision ID: 002
Revises: 001
Create Date: 2026-03-13

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == 'postgresql':
        # ── accounts: add missing columns ──
        op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS hq_address VARCHAR")
        op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS hq_city VARCHAR")
        op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS hq_state VARCHAR")
        op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS hq_zip VARCHAR")
        op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS region VARCHAR")
        op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS employee_count INTEGER")
        op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS segment VARCHAR")
        op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS composite_score FLOAT DEFAULT 0.0")
        op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS score_trend VARCHAR DEFAULT 'stable'")
        op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS deal_stage VARCHAR DEFAULT 'New signal'")
        op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS assigned_rep_id VARCHAR REFERENCES users(id)")

        # ── contacts: add missing columns ──
        op.execute("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS role_category VARCHAR")
        op.execute("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR")
        op.execute("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false")

        # ── activities: add missing column ──
        op.execute("ALTER TABLE activities ADD COLUMN IF NOT EXISTS instantly_message_id VARCHAR")

        # ── signals: add embedding + source_date if missing ──
        op.execute("ALTER TABLE signals ADD COLUMN IF NOT EXISTS embedding JSON")
        op.execute("ALTER TABLE signals ADD COLUMN IF NOT EXISTS source_date TIMESTAMPTZ")

        # ── Create new tables (PostgreSQL) ──
        op.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
                id VARCHAR PRIMARY KEY,
                user_id VARCHAR NOT NULL REFERENCES users(id),
                title VARCHAR NOT NULL,
                body VARCHAR,
                link VARCHAR,
                read BOOLEAN DEFAULT false,
                created_at TIMESTAMPTZ DEFAULT now()
            )
        """)

        op.execute("""
            CREATE TABLE IF NOT EXISTS schedule_configs (
                id VARCHAR PRIMARY KEY,
                task_name VARCHAR UNIQUE NOT NULL,
                cron_expression VARCHAR NOT NULL,
                enabled BOOLEAN DEFAULT true,
                last_triggered TIMESTAMPTZ,
                created_by VARCHAR REFERENCES users(id)
            )
        """)

        op.execute("""
            CREATE TABLE IF NOT EXISTS saved_views (
                id VARCHAR PRIMARY KEY,
                user_id VARCHAR NOT NULL REFERENCES users(id),
                name VARCHAR NOT NULL,
                entity VARCHAR NOT NULL,
                filters JSON NOT NULL,
                created_at TIMESTAMPTZ DEFAULT now()
            )
        """)

        op.execute("""
            CREATE TABLE IF NOT EXISTS signal_gates (
                id VARCHAR PRIMARY KEY,
                name VARCHAR NOT NULL,
                description VARCHAR,
                conditions JSON NOT NULL DEFAULT '{}',
                enabled BOOLEAN DEFAULT true,
                created_by VARCHAR NOT NULL REFERENCES users(id),
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now()
            )
        """)

        op.execute("""
            CREATE TABLE IF NOT EXISTS outreach_sequences (
                id VARCHAR PRIMARY KEY,
                name VARCHAR NOT NULL,
                steps JSON NOT NULL,
                created_by VARCHAR REFERENCES users(id),
                created_at TIMESTAMPTZ DEFAULT now()
            )
        """)

        op.execute("""
            CREATE TABLE IF NOT EXISTS sequence_enrollments (
                id VARCHAR PRIMARY KEY,
                sequence_id VARCHAR REFERENCES outreach_sequences(id) ON DELETE CASCADE,
                contact_id VARCHAR REFERENCES contacts(id),
                account_id VARCHAR REFERENCES accounts(id),
                current_step INTEGER DEFAULT 1,
                status VARCHAR DEFAULT 'active',
                next_send_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT now()
            )
        """)

    else:
        # SQLite: add missing columns; new tables handled by init_db() create_all
        _sqlite_add_columns()


def _sqlite_add_columns():
    """SQLite doesn't support IF NOT EXISTS for columns, so use batch mode."""
    conn = op.get_bind()

    # Check existing columns
    result = conn.execute(sa.text("PRAGMA table_info(accounts)"))
    existing_cols = {row[1] for row in result}

    account_cols = {
        'hq_address': 'VARCHAR',
        'hq_city': 'VARCHAR',
        'hq_state': 'VARCHAR',
        'hq_zip': 'VARCHAR',
        'region': 'VARCHAR',
        'employee_count': 'INTEGER',
        'segment': 'VARCHAR',
        'composite_score': 'FLOAT',
        'score_trend': 'VARCHAR',
        'deal_stage': 'VARCHAR',
        'assigned_rep_id': 'VARCHAR',
    }

    with op.batch_alter_table('accounts') as batch_op:
        for col, typ in account_cols.items():
            if col not in existing_cols:
                batch_op.add_column(sa.Column(col, getattr(sa, typ if typ != 'FLOAT' else 'Float')(), nullable=True))

    result = conn.execute(sa.text("PRAGMA table_info(contacts)"))
    existing_cols = {row[1] for row in result}

    with op.batch_alter_table('contacts') as batch_op:
        if 'role_category' not in existing_cols:
            batch_op.add_column(sa.Column('role_category', sa.String(), nullable=True))
        if 'linkedin_url' not in existing_cols:
            batch_op.add_column(sa.Column('linkedin_url', sa.String(), nullable=True))
        if 'email_verified' not in existing_cols:
            batch_op.add_column(sa.Column('email_verified', sa.Boolean(), server_default='0'))


def downgrade() -> None:
    op.drop_table('sequence_enrollments')
    op.drop_table('outreach_sequences')
    op.drop_table('signal_gates')
    op.drop_table('saved_views')
    op.drop_table('schedule_configs')
    op.drop_table('notifications')

    with op.batch_alter_table('accounts') as batch_op:
        for col in ['hq_address', 'hq_city', 'hq_state', 'hq_zip', 'region',
                     'employee_count', 'segment', 'composite_score', 'score_trend',
                     'deal_stage', 'assigned_rep_id']:
            batch_op.drop_column(col)

    with op.batch_alter_table('contacts') as batch_op:
        batch_op.drop_column('role_category')
        batch_op.drop_column('linkedin_url')
        batch_op.drop_column('email_verified')
