"""Scrape company websites for team/leadership pages to find contacts."""

import re
import hashlib
import aiohttp
from urllib.parse import urljoin

# Common paths where companies list their team
TEAM_PATHS = [
    "/team", "/about/team", "/our-team", "/leadership",
    "/about/leadership", "/about-us", "/about", "/people",
    "/management", "/staff", "/executives", "/about/executives",
]

# Regex patterns for extracting name + title from HTML
# Pattern 1: <h3>Name</h3> followed by <p>Title</p> (or similar heading/paragraph combos)
_PATTERN_HEADING_PARA = re.compile(
    r'<(?:h[2-4]|strong|b)[^>]*>\s*'
    r'([A-Z][a-z]+ (?:[A-Z]\.?\s)?[A-Z][a-z]+(?:\s(?:Jr|Sr|III|IV)\.?)?)\s*'
    r'</(?:h[2-4]|strong|b)>\s*'
    r'<(?:p|span|div)[^>]*>\s*([^<]{3,80})\s*</(?:p|span|div)>',
    re.DOTALL,
)

# Pattern 2: CSS class-based (class="name" ... class="title")
_PATTERN_CSS_CLASS = re.compile(
    r'class="[^"]*(?:name|person-name|member-name)[^"]*"[^>]*>\s*'
    r'([A-Z][a-z]+ (?:[A-Z]\.?\s)?[A-Z][a-z]+)\s*<.*?'
    r'class="[^"]*(?:title|position|role|designation|job-title)[^"]*"[^>]*>\s*'
    r'([^<]{3,80})\s*<',
    re.DOTALL,
)

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


async def scrape_company_website(
    website_url: str,
    company_name: str,
    session: aiohttp.ClientSession,
) -> list[dict]:
    """
    Crawl a company's website to find team/leadership pages
    and extract people + job titles.
    Returns list of dicts: {name, title, source, external_id}
    """
    if not website_url:
        return []

    # Normalize URL
    if not website_url.startswith("http"):
        website_url = f"https://{website_url}"

    headers = {"User-Agent": USER_AGENT}

    for path in TEAM_PATHS:
        url = urljoin(website_url.rstrip("/") + "/", path.lstrip("/"))
        try:
            async with session.get(
                url,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=10),
                allow_redirects=True,
            ) as resp:
                if resp.status != 200:
                    continue

                html = await resp.text()

                # Skip very short pages (likely custom 404s)
                if len(html) < 1000:
                    continue

                people = _extract_people_from_html(html, company_name)
                if people:
                    print(f"  Website: Found {len(people)} people on {url}")
                    return people

        except Exception:
            continue

    return []


def _extract_people_from_html(html: str, company_name: str) -> list[dict]:
    """Extract name/title pairs from HTML using regex patterns."""
    results = []
    seen_names: set[str] = set()

    for pattern in [_PATTERN_HEADING_PARA, _PATTERN_CSS_CLASS]:
        for name_raw, title_raw in pattern.findall(html):
            name = name_raw.strip()
            title = _clean_title(title_raw.strip())

            name_lower = name.lower()
            if name_lower in seen_names:
                continue
            if not _is_valid_person_name(name):
                continue
            if not title or len(title) < 2:
                continue

            seen_names.add(name_lower)
            ext_id = hashlib.md5(
                f"website:{name_lower}:{company_name.lower()}".encode()
            ).hexdigest()[:16]

            results.append({
                "name": name,
                "title": title,
                "source": "company_website",
                "external_id": f"web_{ext_id}",
            })

    return results


def _clean_title(title: str) -> str:
    """Remove HTML entities and normalize whitespace."""
    title = re.sub(r'&[a-z]+;', ' ', title)
    title = re.sub(r'<[^>]+>', '', title)
    title = re.sub(r'\s+', ' ', title).strip()
    return title


def _is_valid_person_name(name: str) -> bool:
    """Basic validation that a string looks like a person's name."""
    parts = name.split()
    if len(parts) < 2 or len(parts) > 5:
        return False
    # Allow short initials like "J." or suffixes like "Jr"
    for p in parts:
        if len(p) < 2 and p not in ('J', 'A', 'M'):
            return False
    if any(c.isdigit() for c in name):
        return False
    return True
