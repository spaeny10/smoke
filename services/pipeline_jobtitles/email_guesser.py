"""Guess email addresses from a person's name and company website domain."""

import re
from urllib.parse import urlparse


def _extract_domain(website: str) -> str:
    """Extract the domain from a URL or raw domain string."""
    if not website.startswith("http"):
        website = f"https://{website}"
    parsed = urlparse(website)
    domain = parsed.hostname or parsed.path
    # Strip www.
    if domain and domain.startswith("www."):
        domain = domain[4:]
    return domain or ""


def _name_parts(full_name: str) -> tuple[str, str]:
    """Split a name into first and last, lowercased."""
    parts = full_name.strip().split()
    if len(parts) < 2:
        return (parts[0].lower() if parts else "", "")
    first = parts[0].lower()
    # Skip suffixes like Jr, Sr, III, IV
    last = parts[-1].lower()
    if last in ("jr", "sr", "jr.", "sr.", "ii", "iii", "iv"):
        last = parts[-2].lower() if len(parts) > 2 else parts[-1].lower()
    # Strip non-alpha
    first = re.sub(r"[^a-z]", "", first)
    last = re.sub(r"[^a-z]", "", last)
    return (first, last)


def guess_emails(full_name: str, website: str) -> list[str]:
    """
    Generate likely email candidates from a person's name and company website.
    Returns list ordered by most common patterns first.
    """
    domain = _extract_domain(website)
    if not domain:
        return []

    first, last = _name_parts(full_name)
    if not first or not last:
        return []

    fi = first[0]  # first initial

    return [
        f"{first}.{last}@{domain}",
        f"{first}{last}@{domain}",
        f"{fi}{last}@{domain}",
        f"{first}@{domain}",
        f"{first}_{last}@{domain}",
        f"{last}.{first}@{domain}",
        f"{fi}.{last}@{domain}",
    ]
