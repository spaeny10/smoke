import re
from rapidfuzz import fuzz, process
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

LEGAL_SUFFIXES_REGEX = re.compile(
    r'\b(llc|inc|corp|co|ltd|lp|llp|company|contractors|construction|builders|group|partners|development)\b',
    re.IGNORECASE
)
PUNCTUATION_REGEX = re.compile(r'[.,]')
WHITESPACE_REGEX = re.compile(r'\s+')

def normalize_company_name(name: str) -> str:
    if not name:
        return ""
    
    # 1. Lowercase
    n = name.lower()
    
    # 3. Handle punctuation (ampersands to "and", strip dots/commas)
    n = n.replace('&', ' and ')
    n = PUNCTUATION_REGEX.sub('', n)
    
    # 2. Strip legal suffixes
    n = LEGAL_SUFFIXES_REGEX.sub('', n)
    
    # 5. Strip "The" prefix
    if n.startswith('the '):
        n = n[4:]
        
    # 4. Collapse whitespace
    n = WHITESPACE_REGEX.sub(' ', n).strip()
    return n

def evaluate_match_score(score: float) -> str:
    """Returns the match category based on score thresholds."""
    if score >= 90:
        return "auto_match"
    elif score >= 85:
        return "flagged_auto_match"
    elif score >= 75:
        return "manual_review"
    return "no_match"

def fuzzy_match_company(normalized_name: str, target_dict: dict[str, str]) -> tuple[str | None, float, str]:
    """
    Find the best match for normalized_name in a dictionary mapping normalized_names to UUIDs.
    Returns: (best_match_id, score, match_category)
    """
    if not target_dict or not normalized_name:
        return None, 0.0, "no_match"
        
    choices = list(target_dict.keys())
    
    # process.extractOne returns (best_match_string, score, index)
    best = process.extractOne(normalized_name, choices, scorer=fuzz.WRatio)
    
    if not best:
        return None, 0.0, "no_match"
        
    best_str, score, _ = best
    
    category = evaluate_match_score(score)
    if category != "no_match":
        return target_dict[best_str], score, category
        
    return None, score, category


async def check_duplicate_account(
    name: str,
    db: AsyncSession,
    exclude_id: str | None = None,
) -> list[dict]:
    """
    Check if an account name matches existing accounts.
    Returns list of matches with id, name, score, category.
    Only surfaces scores >= 85 (auto_match + flagged_auto_match).
    """
    from packages.db.models import Account

    normalized = normalize_company_name(name)
    if not normalized:
        return []

    # Load all existing accounts
    query = select(Account.id, Account.name, Account.name_normalized)
    if exclude_id:
        query = query.where(Account.id != exclude_id)
    rows = (await db.execute(query)).all()

    if not rows:
        return []

    # 1. Exact normalized match
    matches = []
    for row in rows:
        if row.name_normalized == normalized:
            matches.append({
                "id": str(row.id),
                "name": row.name,
                "score": 100.0,
                "category": "exact",
            })

    if matches:
        return matches

    # 2. Fuzzy match against all normalized names
    target_dict = {row.name_normalized: str(row.id) for row in rows}
    name_lookup = {str(row.id): row.name for row in rows}

    best_id, score, category = fuzzy_match_company(normalized, target_dict)

    if best_id and category in ("auto_match", "flagged_auto_match"):
        matches.append({
            "id": best_id,
            "name": name_lookup[best_id],
            "score": round(score, 1),
            "category": category,
        })

    return matches
