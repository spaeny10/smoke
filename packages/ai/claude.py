import os
import json
from anthropic import AsyncAnthropic
from typing import List, Dict, Any
from packages.db.models import Account, Signal, Contact

client = AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", "mock-token-for-dev"))

async def generate_outreach_email(account: Account, signals: List[Signal], contact: Contact = None) -> str:
    """
    Generates a personalized outreach email based on recent AI signals.
    """
    # Just a mock bypass if not configured
    if not os.environ.get("ANTHROPIC_API_KEY"):
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
