import asyncio
import aiohttp
import os
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from sqlalchemy import select

# Add to sys.path to run standalone
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from packages.db.session import async_session
from packages.db.models import Account, CompanyAlias, Signal
from packages.matching.utils import normalize_company_name, fuzzy_match_company
from packages.matching.signal_gates import load_enabled_gates, signal_passes_gates

# Google News RSS — no API key required
# We search for construction industry terms to find relevant news
NEWS_QUERIES = [
    "construction+contract+awarded",
    "general+contractor+project+win",
    "construction+company+expansion",
    "commercial+construction+new+project",
    "infrastructure+construction+bid",
]

GOOGLE_NEWS_RSS = "https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"

# Known major GC names to look for in headlines/descriptions
# This helps match news to accounts even when the company name isn't the contractor_field
KNOWN_GC_PATTERNS = [
    "turner construction", "skanska", "hensel phelps", "clark construction",
    "kiewit", "bechtel", "fluor", "aecom", "jacobs", "parsons",
    "whiting-turner", "holder construction", "brasfield gorrie", "mortenson",
    "gilbane", "structure tone", "suffolk construction", "mccarthy building",
    "barton malow", "dpr construction", "swinerton", "webcor", "austin commercial",
    "balfour beatty", "stantec", "primoris", "granite construction",
    "walsh construction", "shawmut design", "lendlease", "pcl construction",
]


def extract_company_from_text(text: str) -> str | None:
    """Try to find a known GC name in the text."""
    text_lower = text.lower()
    for pattern in KNOWN_GC_PATTERNS:
        if pattern in text_lower:
            # Return the properly cased version from the text
            idx = text_lower.index(pattern)
            return text[idx:idx + len(pattern)]
    return None


def clean_html(text: str) -> str:
    """Strip HTML tags from RSS description."""
    return re.sub(r'<[^>]+>', '', text).strip()


async def fetch_from_google_news() -> list[dict]:
    """Fetch construction news from Google News RSS feeds."""
    all_records = []
    seen_urls = set()

    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
        for query in NEWS_QUERIES:
            try:
                url = GOOGLE_NEWS_RSS.format(query=query)
                async with session.get(url) as resp:
                    if resp.status != 200:
                        print(f"  Google News RSS {resp.status} for query: {query}")
                        continue

                    content = await resp.text()
                    root = ET.fromstring(content)
                    items = root.findall('.//item')

                    for item in items[:20]:  # Cap at 20 per query
                        link = (item.findtext('link') or "").strip()
                        if not link or link in seen_urls:
                            continue
                        seen_urls.add(link)

                        title = (item.findtext('title') or "").strip()
                        description = clean_html(item.findtext('description') or "")
                        pub_date = item.findtext('pubDate') or ""
                        source = (item.findtext('source') or "").strip()

                        # Try to extract a company name from headline + description
                        combined = f"{title} {description}"
                        company = extract_company_from_text(combined)
                        if not company:
                            continue  # Skip if we can't match to a known GC

                        # Parse date
                        published = ""
                        try:
                            dt = parsedate_to_datetime(pub_date)
                            published = dt.strftime("%Y-%m-%dT%H:%M:%SZ")
                        except Exception:
                            published = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

                        # Generate stable ID from URL
                        import hashlib
                        url_hash = hashlib.md5(link.encode()).hexdigest()[:12]

                        all_records.append({
                            "id": f"news_gn_{url_hash}",
                            "title": title[:300],
                            "description": description[:500],
                            "url": link,
                            "published": published,
                            "source_name": source,
                            "matched_company": company,
                        })

                    print(f"  Query '{query}': {len(items)} items, {len([r for r in all_records if r['id'].startswith('news_gn_')])} matched")

            except Exception as e:
                print(f"  Google News RSS error for '{query}': {e}")

    return all_records


async def fetch_news_data():
    print(f"[{datetime.now().isoformat()}] Starting construction news fetch...")

    records = await fetch_from_google_news()
    print(f"  Fetched {len(records)} matched news articles")

    if not records:
        print("  No news articles matched known contractors")
        return

    async with async_session() as db:
        # Load signal gates for filtering
        gates = await load_enabled_gates(db)

        # Load accounts for matching
        result = await db.execute(select(Account.id, Account.name_normalized, Account.segment, Account.employee_count, Account.hq_state, Account.hq_city))
        rows = result.all()
        existing_accounts = {row.name_normalized: str(row.id) for row in rows}
        account_details = {str(row.id): {"segment": row.segment, "employee_count": row.employee_count, "hq_state": row.hq_state, "hq_city": row.hq_city} for row in rows}

        alias_result = await db.execute(select(CompanyAlias.alias, CompanyAlias.account_id))
        existing_aliases = {row.alias: str(row.account_id) for row in alias_result.all()}

        records_fetched = len(records)
        records_matched = 0
        records_scored = 0
        records_gated = 0

        for record in records:
            company_name = record["matched_company"]
            norm_name = normalize_company_name(company_name)

            # Simple matching
            matched_id = existing_aliases.get(norm_name)
            if not matched_id and norm_name in existing_accounts:
                matched_id = existing_accounts[norm_name]

            if not matched_id:
                matched_id, score, match_category = fuzzy_match_company(norm_name, existing_accounts)
                if match_category in ['manual_review', 'no_match']:
                    new_acc = Account(
                        name=company_name,
                        name_normalized=norm_name,
                        tier=0,
                    )
                    db.add(new_acc)
                    await db.flush()
                    matched_id = new_acc.id
                    existing_accounts[norm_name] = str(new_acc.id)
                    account_details[str(new_acc.id)] = {"segment": None, "employee_count": None, "hq_state": None, "hq_city": None}

            if matched_id:
                records_matched += 1

                # Dedup
                dup_check = await db.execute(
                    select(Signal).where(Signal.external_id == record["id"])
                )
                if dup_check.scalars().first():
                    continue

                # Gate check — use account HQ state since news doesn't have its own location
                acct_info = account_details.get(str(matched_id), {})
                if not signal_passes_gates(
                    gates,
                    location_state=acct_info.get("hq_state"),
                    source="news",
                    account_segment=acct_info.get("segment"),
                    account_employee_count=acct_info.get("employee_count"),
                ):
                    records_gated += 1
                    continue

                # Score based on headline content
                pts = 10  # Base for any news mention
                heat = "cool"
                title_lower = record["title"].lower()
                desc_lower = record.get("description", "").lower()
                combined = f"{title_lower} {desc_lower}"

                if any(w in combined for w in ["awarded", "wins", "won", "selected"]):
                    pts += 30
                    heat = "hot"
                    signal_title = "Contract Win Reported in News"
                elif any(w in combined for w in ["breaks ground", "groundbreaking", "begins construction"]):
                    pts += 25
                    heat = "hot"
                    signal_title = "Project Groundbreaking Reported"
                elif any(w in combined for w in ["expands", "expansion", "new office", "new hires", "hiring"]):
                    pts += 20
                    heat = "warm"
                    signal_title = "Company Expansion Reported"
                elif any(w in combined for w in ["bid", "bidding", "proposal", "rfp"]):
                    pts += 15
                    heat = "warm"
                    signal_title = "Bidding Activity Reported"
                else:
                    signal_title = "Industry News Mention"

                # Try to extract dollar amounts from text
                import re
                money_match = re.search(r'\$\s*([\d,.]+)\s*(million|billion|M|B)', combined)
                project_value = None
                if money_match:
                    val = float(money_match.group(1).replace(",", ""))
                    unit = money_match.group(2).lower()
                    if unit in ("billion", "b"):
                        project_value = val * 1_000_000_000
                    else:
                        project_value = val * 1_000_000
                    if project_value >= 100_000_000:
                        pts += 10

                # Parse source date
                source_date = None
                try:
                    pub = record.get("published")
                    if pub:
                        source_date = datetime.fromisoformat(str(pub).replace("Z", "+00:00")) if "T" in str(pub) else datetime.strptime(str(pub)[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                except (ValueError, TypeError):
                    pass

                src_name = record.get("source_name", "Google News")
                article_title = record.get("title", "")
                detail_parts = [article_title]
                detail_parts.append(f"Source: {src_name}")
                if project_value:
                    detail_parts.append(f"Est. Value: ${project_value / 1_000_000:.1f}M")
                detail = " | ".join(detail_parts)

                source_url = record.get("url") or None

                # Use matched account's HQ location (news doesn't have its own)
                acct_info = account_details.get(str(matched_id), {}) if matched_id else {}
                loc_state = acct_info.get("hq_state") or None
                loc_city = acct_info.get("hq_city") or None

                new_signal = Signal(
                    account_id=matched_id,
                    source="news",
                    signal_type="news_mention",
                    heat=heat,
                    title=signal_title,
                    detail=detail[:500],
                    raw_data=record,
                    score_contribution=pts,
                    external_id=record["id"],
                    project_value=project_value,
                    location_city=loc_city,
                    location_state=loc_state,
                    source_url=source_url,
                    source_date=source_date,
                )
                db.add(new_signal)
                records_scored += 1

        await db.commit()

    print(f"[{datetime.now().isoformat()}] News pipeline complete.")
    print(f"records_fetched={records_fetched} records_matched={records_matched} records_gated={records_gated} records_scored={records_scored}")

if __name__ == "__main__":
    asyncio.run(fetch_news_data())
