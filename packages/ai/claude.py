import os
import json
from anthropic import AsyncAnthropic
from typing import List, Dict, Any, Optional
from packages.db.models import Account, Signal, Contact

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY or "mock-token-for-dev")

SEARCH_MODEL = "claude-haiku-4-5-20251001"

async def generate_outreach_email(account: Account, signals: List[Signal], contact: Contact = None) -> str:
    """
    Generates a personalized outreach email based on recent AI signals.
    """
    # Just a mock bypass if not configured
    if not ANTHROPIC_API_KEY:
        return f"""Hi {contact.name if contact else 'Team'},

I saw that {account.name} recently had some interesting activity:
{[s.title for s in signals]}

We specialize in site trailers and equipment for these exact types of projects. I'd love to connect to discuss how we can support your upcoming work.

Best,
The Smoke Team"""

    # Prepare prompt Context
    signal_context = ""
    for s in signals:
        signal_context += f"- [{s.signal_type}] {s.title}: {s.detail}\n"

    contact_name = contact.name if contact else "Team"
    
    prompt = f"""
    You are an expert sales representative for 'Smoke', a premium construction site trailer and equipment provider.
    You are writing a cold outreach email to {contact_name} at {account.name}.
    
    Recent Signals Detected for this Account:
    {signal_context}
    
    Instructions:
    - Write a short, punchy (under 100 words), highly personalized cold email.
    - Reference the specific signals to build immediate relevance.
    - The call to action should be a soft ask for a 5-minute chat or pointing them to a relevant resource.
    - Tone: Professional, direct, helpful. Not overly salesy.
    """

    try:
        response = await client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=300,
            temperature=0.7,
            system="You are an elite B2B sales copywriter.",
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        return response.content[0].text
    except Exception as e:
        print(f"Error generating Claude outreach: {e}")
        return "Error generating email template."


SEARCH_SYSTEM_PROMPT = """You are SMOKE AI, a sales intelligence assistant for a construction GTM platform.

You help sales reps find relevant signals about construction companies. The database has signals from these sources:
- OSHA: Safety inspections, violations, penalties (source="osha", signal_type="inspection")
- Procore: Project bids, pre-construction awards (source="procore", signal_type="project_award")
- Permits: Building permits from city open data portals — Chicago, LA, NYC (source="permit", signal_type="permit")
- Federal Contracts: USASpending.gov construction contract awards — DOD, GSA, DOT (source="usaspending", signal_type="contract_award")
- News: Construction industry news from Google News — contract wins, groundbreakings, expansions (source="news", signal_type="news_mention")

Each signal has these fields:
- source: "osha", "procore", "permit", "usaspending", "news"
- signal_type: "inspection", "project_award", "permit", "contract_award", "news_mention"
- heat: "hot", "warm", "cool"
- status: "new", "viewed", "actioned", "dismissed"
- location_state: 2-letter state code (e.g. "TX", "NY", "CA")
- location_city: city name
- title: signal headline
- detail: description
- project_value: dollar amount (float)
- detected_at: when it was detected

When the user asks a question, extract structured search filters as JSON. Return ONLY valid JSON with these optional fields:
{
  "source": "osha|procore|permit|usaspending|news",
  "heat": "hot|warm|cool",
  "status": "new|viewed|actioned|dismissed",
  "location_state": "TX",
  "location_city": "Austin",
  "search_text": "keywords to match in title/detail",
  "min_value": 5000000,
  "date_range_days": 7,
  "limit": 10
}

Only include fields that the user explicitly or implicitly mentioned. If unsure, omit the field."""


async def interpret_search_query(query: str) -> Dict[str, Any]:
    """Use Claude to interpret a natural language search query into structured filters."""
    if not ANTHROPIC_API_KEY:
        # Mock: return basic filters based on keywords
        filters: Dict[str, Any] = {}
        q = query.lower()
        if "osha" in q: filters["source"] = "osha"
        if "procore" in q: filters["source"] = "procore"
        if "permit" in q: filters["source"] = "permit"
        if "contract" in q or "federal" in q or "usaspending" in q: filters["source"] = "usaspending"
        if "news" in q: filters["source"] = "news"
        if "hot" in q: filters["heat"] = "hot"
        for state in ["texas", "tx"]:
            if state in q: filters["location_state"] = "TX"
        for state in ["new york", "ny"]:
            if state in q: filters["location_state"] = "NY"
        for state in ["california", "ca"]:
            if state in q: filters["location_state"] = "CA"
        return filters

    try:
        response = await client.messages.create(
            model=SEARCH_MODEL,
            max_tokens=200,
            temperature=0,
            system=SEARCH_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": query}]
        )
        text = response.content[0].text.strip()
        # Extract JSON from response (handle markdown code blocks)
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        return json.loads(text)
    except Exception as e:
        print(f"Error interpreting search query: {e}")
        return {}


async def summarize_search_results(query: str, signals_data: List[Dict[str, Any]], accounts_data: List[Dict[str, Any]]) -> str:
    """Use Claude to generate a conversational summary of search results."""
    if not ANTHROPIC_API_KEY:
        count = len(signals_data)
        if count == 0:
            return "I didn't find any signals matching your criteria. Try broadening your search or adjusting the filters."
        companies = list(set(s.get("account_name", "Unknown") for s in signals_data))
        return f"I found {count} signal{'s' if count != 1 else ''} across {len(companies)} compan{'ies' if len(companies) != 1 else 'y'}. The most relevant companies are: {', '.join(companies[:5])}. Check the results below for details."

    context = f"User query: {query}\n\nResults found: {len(signals_data)} signals\n\n"
    for i, s in enumerate(signals_data[:10]):
        context += f"{i+1}. [{s.get('source', '').upper()}] {s.get('title', '')} — {s.get('account_name', 'Unknown')} ({s.get('location_city', '')}, {s.get('location_state', '')})\n"

    try:
        response = await client.messages.create(
            model=SEARCH_MODEL,
            max_tokens=300,
            temperature=0.5,
            system="You are SMOKE AI, a sales intelligence assistant. Summarize the search results concisely (2-3 sentences). Highlight the most actionable signals and recommend which companies to prioritize. Be direct and specific.",
            messages=[{"role": "user", "content": context}]
        )
        return response.content[0].text
    except Exception as e:
        print(f"Error summarizing results: {e}")
        count = len(signals_data)
        return f"Found {count} signal{'s' if count != 1 else ''} matching your search."
