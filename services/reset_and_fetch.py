"""Reset signal/account data and run all pipelines to collect fresh real data."""
import asyncio
import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import text
from packages.db.session import async_session, init_db


async def reset_data():
    """Clear all signals, accounts, contacts, projects, etc. Keep teams and users."""
    print("=" * 60)
    print("RESETTING DATABASE — clearing seed data...")
    print("=" * 60)

    await init_db()  # Ensure tables exist

    async with async_session() as db:
        # Order matters due to foreign keys
        tables = [
            "outreach_messages",
            "activities",
            "signals",
            "projects",
            "contacts",
            "company_aliases",
            "accounts",
            "sendgrid_logs",
            "twilio_logs",
        ]
        for table in tables:
            try:
                result = await db.execute(text(f"DELETE FROM {table}"))
                print(f"  Cleared {table}: {result.rowcount} rows deleted")
            except Exception as e:
                print(f"  Skipped {table}: {e}")

        await db.commit()

    print("\nDatabase reset complete. Teams and users preserved.\n")


async def run_all_pipelines():
    """Run all data collection pipelines sequentially."""
    print("=" * 60)
    print("RUNNING ALL PIPELINES — collecting real data...")
    print("=" * 60)

    # Import and run each pipeline
    from services.pipeline_permits.main import fetch_permit_data
    from services.pipeline_contracts.main import fetch_contract_data
    from services.pipeline_news.main import fetch_news_data
    from services.pipeline_osha.main import fetch_osha_data

    print("\n--- PIPELINE 1: Building Permits (Socrata) ---")
    await fetch_permit_data()

    print("\n--- PIPELINE 2: Federal Contracts (USASpending) ---")
    await fetch_contract_data()

    print("\n--- PIPELINE 3: Construction News (Google News RSS) ---")
    await fetch_news_data()

    print("\n--- PIPELINE 4: OSHA Inspections ---")
    await fetch_osha_data()

    # Print summary
    print("\n" + "=" * 60)
    print("ALL PIPELINES COMPLETE")
    print("=" * 60)

    async with async_session() as db:
        from sqlalchemy import func, select
        from packages.db.models import Signal, Account

        sig_count = await db.execute(select(func.count()).select_from(Signal))
        acc_count = await db.execute(select(func.count()).select_from(Account))
        print(f"\nTotal signals: {sig_count.scalar()}")
        print(f"Total accounts: {acc_count.scalar()}")

        # Breakdown by source
        from sqlalchemy import distinct
        sources = await db.execute(
            select(Signal.source, func.count(Signal.id))
            .group_by(Signal.source)
        )
        print("\nSignals by source:")
        for source, count in sources.all():
            print(f"  {source}: {count}")


async def main():
    await reset_data()
    await run_all_pipelines()


if __name__ == "__main__":
    asyncio.run(main())
