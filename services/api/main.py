from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Dict, Any
import pandas as pd
import io

from packages.db.session import get_db, init_db
from packages.db.models import Account, Contact, CompanyAlias
from packages.matching.utils import normalize_company_name, fuzzy_match_company
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(title="Construction GTM API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from sqlalchemy import select, func
from packages.db.models import Account, Contact, CompanyAlias, Signal, User

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/api/metrics")
async def get_dashboard_metrics(db: AsyncSession = Depends(get_db)):
    acct_query = await db.execute(select(func.count(Account.id)))
    accounts_count = acct_query.scalar() or 0
    
    sig_query = await db.execute(select(func.count(Signal.id)))
    signals_count = sig_query.scalar() or 0
    
    return {
        "activeAccounts": accounts_count,
        "newSignals": signals_count,
        "highPriorityContacts": 52,
        "outreachSent": 610
    }

@app.post("/accounts/import/csv")
async def import_accounts_csv(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
        
    content = await file.read()
    try:
        df = pd.read_csv(io.StringIO(content.decode("utf-8")))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing CSV: {e}")
        
    required_cols = ['company_name']
    if not all(col in df.columns for col in required_cols):
        raise HTTPException(status_code=400, detail=f"CSV missing required columns: {required_cols}")

    # Process all existing accounts to make a dictionary of {normalized_name: account_id}
    # For a real system with 2,000 accounts this is fast enough.
    result = await db.execute(select(Account.id, Account.name_normalized))
    existing_accounts = {row.name_normalized: str(row.id) for row in result.all()}
    
    # Also fetch all aliases
    alias_result = await db.execute(select(CompanyAlias.alias, CompanyAlias.account_id))
    existing_aliases = {row.alias: str(row.account_id) for row in alias_result.all()}

    results: Dict[str, Any] = {
        "auto_matched": 0,
        "flagged_for_review": 0,
        "manual_review_required": 0,
        "new_accounts_created": 0,
        "contacts_added": 0,
        "errors": []
    }
    
    for index, row in df.iterrows():
        try:
            company_name = str(row['company_name'])
            norm_name = normalize_company_name(company_name)
            
            contact_name = str(row.get('contact_name', ''))
            contact_email = str(row.get('contact_email', ''))
            contact_phone = str(row.get('contact_phone', ''))

            if pd.isna(contact_name) or contact_name == 'nan':
                contact_name = ""
            if pd.isna(contact_email) or contact_email == 'nan':
                contact_email = ""
            if pd.isna(contact_phone) or contact_phone == 'nan':
                contact_phone = ""
                
            # Check for exact alias match
            matched_id = existing_aliases.get(norm_name)
            match_category = "alias_match"
            score = 100.0
            
            # If no exact alias match, check existing accounts
            if not matched_id and norm_name in existing_accounts:
                matched_id = existing_accounts[norm_name]
                match_category = "exact_match"
            
            # If no exact match, fuzzy match
            if not matched_id:
                matched_id, score, match_category = fuzzy_match_company(norm_name, existing_accounts)
            
            account_id_to_use = None
            
            if match_category in ("exact_match", "alias_match", "auto_match", "flagged_auto_match"):
                if match_category == "flagged_auto_match":
                    results["flagged_for_review"] += 1
                else:
                    results["auto_matched"] += 1
                    
                account_id_to_use = matched_id
                
            elif match_category == "manual_review":
                results["manual_review_required"] += 1
                # In a real app we would queue this in a manual_review setup. For now we skip insert.
                continue
                
            else: # new account
                new_acc = Account(
                    name=company_name,
                    name_normalized=norm_name,
                    hq_address=str(row.get('address', '')) if 'address' in row and pd.notna(row['address']) else None,
                    hq_city=str(row.get('city', '')) if 'city' in row and pd.notna(row['city']) else None,
                    hq_state=str(row.get('state', '')) if 'state' in row and pd.notna(row['state']) else None,
                    hq_zip=str(row.get('zip', '')) if 'zip' in row and pd.notna(row['zip']) else None,
                )
                
                # Fetch reps and assign randomly/round-robin for demo
                reps_result = await db.execute(select(User).where(User.role == 'rep'))
                reps = reps_result.scalars().all()
                if reps:
                    import random
                    new_acc.assigned_rep_id = random.choice(reps).id
                    
                db.add(new_acc)
                await db.flush() # get ID
                account_id_to_use = new_acc.id
                existing_accounts[norm_name] = str(new_acc.id)
                results["new_accounts_created"] += 1
                
            # Add contact if we have data
            if contact_name and account_id_to_use:
                new_contact = Contact(
                    account_id=account_id_to_use,
                    name=contact_name,
                    email=contact_email,
                    phone=contact_phone or None,
                    title=str(row.get('title', '')) if 'title' in row and pd.notna(row['title']) else None,
                    source='CSV'
                )
                db.add(new_contact)
                results["contacts_added"] += 1
                
        except Exception as e:
            results["errors"].append(f"Row {index}: {str(e)}")

    await db.commit()
    return {"message": "Import sequence complete.", "results": results}

from packages.ai.claude import generate_outreach_email
from services.api.schemas import OutreachGenerateRequest

@app.post("/api/outreach/generate")
async def generate_outreach(req: OutreachGenerateRequest, db: AsyncSession = Depends(get_db)):
    account = await db.scalar(select(Account).where(Account.id == req.account_id))
    contact = await db.scalar(select(Contact).where(Contact.id == req.contact_id))
    
    if not account or not contact:
        raise HTTPException(status_code=404, detail="Account or Contact not found")
        
    signals_query = await db.execute(select(Signal).where(Signal.account_id == req.account_id).order_by(Signal.detected_at.desc()).limit(3))
    signals = list(signals_query.scalars().all())
    
    message_text = await generate_outreach_email(account, signals, contact)
    
    return {"status": "success", "message_text": message_text, "signals_used": [s.id for s in signals]}

@app.get("/api/demo/outreach")
async def demo_outreach(db: AsyncSession = Depends(get_db)):
    # Grab the first account and contact for demo purposes
    account = await db.scalar(select(Account).limit(1))
    contact = await db.scalar(select(Contact).limit(1))
    
    if not account:
        return {"status": "error", "message": "No accounts in DB. Run seed or CSV upload first."}
        
    signals_query = await db.execute(select(Signal).where(Signal.account_id == account.id).order_by(Signal.detected_at.desc()).limit(3))
    signals = list(signals_query.scalars().all())
    
    message_text = await generate_outreach_email(account, signals, contact)
    
    return {
        "status": "success", 
        "account_name": account.name,
        "contact_name": contact.name if contact else "Team",
        "message_text": message_text, 
        "signals_used": len(signals)
    }

from services.api.routers import accounts, contacts, projects, signals, auth, ai, teams, users, signal_gates

app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(contacts.router)
app.include_router(projects.router)
app.include_router(signals.router)
app.include_router(ai.router)
app.include_router(teams.router)
app.include_router(users.router)
app.include_router(signal_gates.router)

# Serve built frontend static files in production
from pathlib import Path
from fastapi.staticfiles import StaticFiles

_static_dir = Path(__file__).resolve().parent.parent.parent / "static"
if _static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="static")
