"""Map job titles to role_category values used in the Contact model."""

ROLE_RULES = [
    # (keywords_in_title, role_category)
    (["ceo", "chief executive", "president", "owner", "principal", "managing director", "founder"], "Decision Maker"),
    (["cfo", "chief financial", "vp finance", "controller", "treasurer"], "Finance"),
    (["coo", "chief operating", "operations director", "vp operations"], "Operations"),
    (["cto", "chief technology", "vp engineering", "director of technology", "it director"], "Technical"),
    (["vp", "vice president", "svp", "evp", "senior vice president"], "Executive"),
    (["director", "head of"], "Director"),
    (["project manager", "construction manager", "site manager", "superintendent", "field manager"], "Project Management"),
    (["estimator", "preconstruction", "pre-construction", "bid manager"], "Preconstruction"),
    (["safety", "ehs", "hse", "health and safety"], "Safety"),
    (["procurement", "purchasing", "supply chain", "buyer"], "Procurement"),
    (["business development", "bd manager", "sales", "account executive"], "Business Development"),
    (["marketing", "communications", "pr ", "public relations"], "Marketing"),
    (["hr", "human resources", "talent", "recruiting", "people operations"], "HR"),
    (["legal", "counsel", "compliance", "general counsel"], "Legal"),
    (["engineer", "engineering"], "Engineering"),
]


def classify_role(title: str) -> str:
    """Map a job title string to a role_category. Returns 'Other' if no match."""
    if not title:
        return "Other"
    title_lower = title.lower().strip()
    for keywords, category in ROLE_RULES:
        if any(kw in title_lower for kw in keywords):
            return category
    return "Other"
