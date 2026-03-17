"""Job title discovery pipeline — scrape LinkedIn and company websites for contacts."""

import asyncio
import aiohttp
import os
import sys
from datetime import datetime, timezone
from sqlalchemy import select, and_

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from packages.db.session import async_session
from packages.db.models import Account, Contact, Signal
from packages.matching.signal_gates import load_enabled_gates, signal_passes_gates
from services.pipeline_jobtitles.scrapers.linkedin_google import scrape_linkedin_via_google
from services.pipeline_jobtitles.scrapers.company_website import scrape_company_website
from services.pipeline_jobtitles.role_classifier import classify_role

ENABLE_LINKEDIN = os.environ.get("JOBTITLE_ENABLE_LINKEDIN", "true").lower() == "true"
ENABLE_WEBSITE = os.environ.get("JOBTITLE_ENABLE_WEBSITE", "true").lower() == "true"
DELAY_BETWEEN_ACCOUNTS = float(os.environ.get("JOBTITLE_DELAY_SECONDS", "2.0"))
MAX_ACCOUNTS_PER_RUN = int(os.environ.get("JOBTITLE_MAX_ACCOUNTS", "50"))

# Mock data for development/testing (same pattern as other pipelines)


async def fetch_jobtitle_data(account_id: str | None = None):
    """
    Main pipeline entry point.

    If account_id is provided: scrape only that account (per-account trigger).
    If account_id is None: scrape all tier 1-3 accounts (batch mode).
    """
    mode = "single" if account_id else "batch"
    print(f"[{datetime.now().isoformat()}] Starting job title pipeline ({mode} mode)...")

    async with async_session() as db:
        # Load signal gates for filtering
        gates = await load_enabled_gates(db)

        # Load target accounts
        if account_id:
            result = await db.execute(
                select(Account).where(Account.id == account_id)
            )
            accounts = result.scalars().all()
        else:
            result = await db.execute(
                select(Account)
                .where(Account.tier > 0)
                .order_by(Account.tier.asc(), Account.composite_score.desc())
                .limit(MAX_ACCOUNTS_PER_RUN)
            )
            accounts = result.scalars().all()

        if not accounts:
            print("  No accounts to process.")
            return

        # Pre-load existing contacts for dedup (name -> set per account)
        account_ids = [a.id for a in accounts]
        contacts_result = await db.execute(
            select(Contact.account_id, Contact.name, Contact.linkedin_url)
            .where(Contact.account_id.in_(account_ids))
        )
        existing_names: dict[str, set[str]] = {}
        existing_linkedin: dict[str, set[str]] = {}
        for row in contacts_result.all():
            existing_names.setdefault(row.account_id, set()).add(row.name.lower().strip())
            if row.linkedin_url:
                existing_linkedin.setdefault(row.account_id, set()).add(row.linkedin_url.lower())

        total_added = 0
        total_skipped = 0
        accounts_processed = 0

        async with aiohttp.ClientSession() as http_session:
            for acct in accounts:
                scraped_contacts: list[dict] = []

                # Source 1: LinkedIn via Google search
                if ENABLE_LINKEDIN:
                    li_contacts = await scrape_linkedin_via_google(
                        acct.name, http_session
                    )
                    scraped_contacts.extend(li_contacts)

                # Source 2: Company website
                if ENABLE_WEBSITE and getattr(acct, 'website', None):
                    web_contacts = await scrape_company_website(
                        acct.website, acct.name, http_session
                    )
                    scraped_contacts.extend(web_contacts)

                if not scraped_contacts:
                    continue

                # Deduplicate and insert contacts
                added_for_account = 0
                for sc in scraped_contacts:
                    name_lower = sc["name"].lower().strip()

                    # Check name dedup
                    acct_names = existing_names.get(acct.id, set())
                    if name_lower in acct_names:
                        total_skipped += 1
                        continue

                    # Check LinkedIn URL dedup
                    li_url = sc.get("linkedin_url")
                    if li_url:
                        acct_urls = existing_linkedin.get(acct.id, set())
                        if li_url.lower() in acct_urls:
                            total_skipped += 1
                            continue

                    role_cat = classify_role(sc.get("title", ""))

                    new_contact = Contact(
                        account_id=acct.id,
                        name=sc["name"],
                        title=sc.get("title"),
                        role_category=role_cat,
                        linkedin_url=sc.get("linkedin_url"),
                        source=sc.get("source", "scraped"),
                    )
                    db.add(new_contact)

                    # Update in-memory caches
                    existing_names.setdefault(acct.id, set()).add(name_lower)
                    if li_url:
                        existing_linkedin.setdefault(acct.id, set()).add(li_url.lower())

                    added_for_account += 1
                    total_added += 1

                # Create a Signal if we discovered new contacts
                if added_for_account > 0:
                    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
                    signal_ext_id = f"jobtitle_{acct.id}_{today_str}"

                    dup_check = await db.execute(
                        select(Signal).where(Signal.external_id == signal_ext_id)
                    )
                    if not dup_check.scalars().first():
                        # Gate check — skip signal if it doesn't match any enabled gate
                        if signal_passes_gates(
                            gates,
                            source="jobtitles",
                            account_segment=getattr(acct, "segment", None),
                            account_employee_count=getattr(acct, "employee_count", None),
                        ):
                            signal = Signal(
                                account_id=acct.id,
                                source="jobtitles",
                                signal_type="contacts_discovered",
                                heat="warm",
                                title=f"{added_for_account} New Contact{'s' if added_for_account != 1 else ''} Discovered",
                                detail=f"Discovered {added_for_account} new contact(s) via job title scraping for {acct.name}",
                                raw_data={"contacts_added": added_for_account, "date": today_str},
                                score_contribution=5 + (added_for_account * 2),
                                external_id=signal_ext_id,
                                location_city=getattr(acct, "hq_city", None),
                                location_state=getattr(acct, "hq_state", None),
                            )
                            db.add(signal)

                accounts_processed += 1
                print(f"  [{accounts_processed}/{len(accounts)}] {acct.name}: +{added_for_account} contacts ({total_skipped} skipped)")

                # Rate limiting between accounts (batch mode only)
                if not account_id and accounts_processed < len(accounts):
                    await asyncio.sleep(DELAY_BETWEEN_ACCOUNTS)

        await db.commit()

    print(f"[{datetime.now().isoformat()}] Job title pipeline complete.")
    print(f"  accounts={accounts_processed}  added={total_added}  skipped={total_skipped}")


if __name__ == "__main__":
    asyncio.run(fetch_jobtitle_data())
