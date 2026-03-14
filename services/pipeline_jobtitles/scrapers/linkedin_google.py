"""Scrape LinkedIn public profiles via Google search."""

import re
import hashlib
import asyncio
import aiohttp
from urllib.parse import quote_plus

GOOGLE_SEARCH_URL = "https://www.google.com/search"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

DELAY_BETWEEN_SEARCHES = 3.0


async def scrape_linkedin_via_google(
    company_name: str,
    session: aiohttp.ClientSession,
    max_results: int = 10,
) -> list[dict]:
    """
    Search Google for LinkedIn profiles at a given company.
    Returns list of dicts: {name, title, linkedin_url, source, external_id}
    """
    query = f'site:linkedin.com/in/ "{company_name}"'
    params = {"q": query, "num": max_results}
    headers = {"User-Agent": USER_AGENT}

    try:
        async with session.get(
            GOOGLE_SEARCH_URL,
            params=params,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=15),
        ) as resp:
            if resp.status != 200:
                print(f"  LinkedIn/Google: HTTP {resp.status} for '{company_name}'")
                return []
            html = await resp.text()
            return _parse_google_linkedin_results(html)
    except Exception as e:
        print(f"  LinkedIn/Google search error for '{company_name}': {e}")
        return []


# LinkedIn Google results have titles like:
# "FirstName LastName - Job Title - Company | LinkedIn"
# "FirstName LastName - Job Title at Company | LinkedIn"
_TITLE_PATTERN = re.compile(
    r'(?:>|")([A-Z][a-z]+(?:\s[A-Z]\.?)?\s[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)'
    r'\s*[\u2013\u2014\-]+\s*'
    r'(.+?)'
    r'\s*[\u2013\u2014\-|]+\s*',
    re.UNICODE,
)

_URL_PATTERN = re.compile(r'https?://(?:www\.)?linkedin\.com/in/([\w-]+)')


def _parse_google_linkedin_results(html: str) -> list[dict]:
    """Parse Google result HTML for LinkedIn profile data."""
    results = []
    seen_urls = set()

    urls = _URL_PATTERN.findall(html)
    titles = _TITLE_PATTERN.findall(html)

    for i, username in enumerate(urls):
        url = f"https://www.linkedin.com/in/{username}"
        if url in seen_urls:
            continue
        seen_urls.add(url)

        name = ""
        title = ""
        if i < len(titles):
            name = titles[i][0].strip()
            raw_title = titles[i][1].strip()
            # Clean up title: remove "at Company" suffix, "| LinkedIn", etc.
            raw_title = re.sub(r'\s*(?:at|@)\s+.*$', '', raw_title, flags=re.IGNORECASE)
            raw_title = re.sub(r'\s*\|.*$', '', raw_title)
            title = raw_title.strip()

        if not name or len(name) < 3:
            continue

        # Validate it looks like a real person name
        parts = name.split()
        if len(parts) < 2 or len(parts) > 4:
            continue
        if any(c.isdigit() for c in name):
            continue

        url_hash = hashlib.md5(url.encode()).hexdigest()[:12]
        results.append({
            "name": name,
            "title": title if title else None,
            "linkedin_url": url,
            "source": "linkedin_google",
            "external_id": f"li_{url_hash}",
        })

    return results
