from pydantic import BaseModel, ConfigDict
from typing import Optional, Generic, TypeVar, List
from datetime import datetime

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    offset: int
    limit: int


# ── Account ──────────────────────────────────────────────

class AccountCreate(BaseModel):
    name: str
    hq_city: Optional[str] = None
    hq_state: Optional[str] = None
    region: Optional[str] = None
    employee_count: Optional[int] = None
    segment: Optional[str] = None


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    hq_city: Optional[str] = None
    hq_state: Optional[str] = None
    region: Optional[str] = None
    employee_count: Optional[int] = None
    segment: Optional[str] = None
    deal_stage: Optional[str] = None
    composite_score: Optional[float] = None
    score_trend: Optional[str] = None
    assigned_rep_id: Optional[str] = None
    next_step_text: Optional[str] = None


class AccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    name_normalized: str
    hq_city: Optional[str] = None
    hq_state: Optional[str] = None
    region: Optional[str] = None
    employee_count: Optional[int] = None
    segment: Optional[str] = None
    composite_score: float
    score_trend: str
    deal_stage: str
    assigned_rep_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ── Contact ──────────────────────────────────────────────

class ContactCreate(BaseModel):
    account_id: str
    name: str
    title: Optional[str] = None
    role_category: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    source: Optional[str] = None


class ContactUpdate(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    role_category: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None


class ContactRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str
    name: str
    title: Optional[str] = None
    role_category: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    source: Optional[str] = None
    email_verified: bool
    created_at: datetime
    account_name: Optional[str] = None


# ── Project ──────────────────────────────────────────────

class ProjectCreate(BaseModel):
    account_id: str
    name: str
    description: Optional[str] = None
    primary_contact_id: Optional[str] = None
    stage: Optional[str] = "new"
    origin: Optional[str] = "manual"
    estimated_value: Optional[float] = 0.0


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    primary_contact_id: Optional[str] = None
    stage: Optional[str] = None
    estimated_value: Optional[float] = None


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str
    primary_contact_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    stage: str
    origin: str
    estimated_value: float
    created_at: datetime
    updated_at: datetime
    account_name: Optional[str] = None


# ── Signal ───────────────────────────────────────────────

class SignalCreate(BaseModel):
    account_id: str
    source: str
    signal_type: str
    heat: Optional[str] = "cool"
    title: str
    detail: Optional[str] = None
    score_contribution: Optional[float] = 0.0
    location_city: Optional[str] = None
    location_state: Optional[str] = None


class SignalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str
    source: str
    signal_type: str
    heat: str
    title: str
    detail: Optional[str] = None
    score_contribution: float
    project_name: Optional[str] = None
    project_value: Optional[float] = None
    location_city: Optional[str] = None
    location_state: Optional[str] = None
    detected_at: datetime
    created_at: datetime


# ── Auth ─────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    team_id: Optional[str] = None
    role: Optional[str] = "rep"


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    name: str
    role: str
    team_id: Optional[str] = None
    created_at: datetime


# ── Outreach (moved from main.py) ───────────────────────

class OutreachGenerateRequest(BaseModel):
    account_id: str
    contact_id: str
