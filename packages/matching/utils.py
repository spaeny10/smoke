import re
from rapidfuzz import fuzz, process

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
