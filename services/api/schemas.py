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
    hq_address: Optional[str] = None
    hq_city: Optional[str] = None
    hq_state: Optional[str] = None
    hq_zip: Optional[str] = None
    region: Optional[str] = None
    employee_count: Optional[int] = None
    segment: Optional[str] = None
    tier: Optional[int] = 3


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    hq_address: Optional[str] = None
    hq_city: Optional[str] = None
    hq_state: Optional[str] = None
    hq_zip: Optional[str] = None
    region: Optional[str] = None
    employee_count: Optional[int] = None
    segment: Optional[str] = None
    tier: Optional[int] = None
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
    hq_address: Optional[str] = None
    hq_city: Optional[str] = None
    hq_state: Optional[str] = None
    hq_zip: Optional[str] = None
    region: Optional[str] = None
    employee_count: Optional[int] = None
    segment: Optional[str] = None
    tier: int
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
    signal_id: Optional[str] = None
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
    signal_id: Optional[str] = None
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
    status: str
    title: str
    detail: Optional[str] = None
    score_contribution: float
    project_name: Optional[str] = None
    project_value: Optional[float] = None
    location_city: Optional[str] = None
    location_state: Optional[str] = None
    detected_at: datetime
    created_at: datetime
    source_date: Optional[datetime] = None
    account_name: Optional[str] = None


class SignalStatusUpdate(BaseModel):
    status: str  # 'viewed', 'actioned', 'dismissed'


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


class GoogleAuthRequest(BaseModel):
    credential: str


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


# ── Team ─────────────────────────────────────────────────

class TeamCreate(BaseModel):
    name: str


class TeamRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime


class TeamWithMembers(TeamRead):
    members: List[UserRead] = []


class UserRoleUpdate(BaseModel):
    role: Optional[str] = None
    team_id: Optional[str] = None


# ── Notification ───────────────────────────────────────

class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    title: str
    body: Optional[str] = None
    link: Optional[str] = None
    read: bool
    created_at: datetime


# ── Activity ──────────────────────────────────────────

class ActivityCreate(BaseModel):
    account_id: str
    channel: str
    direction: str
    summary: str
    contact_id: Optional[str] = None


class ActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str
    contact_id: Optional[str] = None
    user_id: Optional[str] = None
    channel: str
    direction: str
    summary: str
    is_auto_logged: bool
    created_at: datetime


# ── Bulk Actions ──────────────────────────────────────

class BulkAccountUpdate(BaseModel):
    ids: List[str]
    updates: dict


class BulkAccountDelete(BaseModel):
    ids: List[str]


# ── Schedule Config ───────────────────────────────────

class ScheduleConfigRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    task_name: str
    cron_expression: str
    enabled: bool
    last_triggered: Optional[datetime] = None


class ScheduleConfigUpdate(BaseModel):
    cron_expression: Optional[str] = None
    enabled: Optional[bool] = None


# ── Saved View ───────────────────────────────────────

class SavedViewCreate(BaseModel):
    name: str
    entity: str
    filters: dict


class SavedViewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    name: str
    entity: str
    filters: dict
    created_at: datetime


# ── Outreach Sequences ──────────────────────────────────

class SequenceStepSchema(BaseModel):
    step: int
    channel: str
    delay_days: int = 0
    template: str


class SequenceCreate(BaseModel):
    name: str
    steps: List[SequenceStepSchema]


class SequenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    steps: list
    created_by: Optional[str] = None
    created_at: datetime


class EnrollmentCreate(BaseModel):
    contact_id: str
    account_id: str


class EnrollmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    sequence_id: str
    contact_id: str
    account_id: str
    current_step: int
    status: str
    next_send_at: Optional[datetime] = None
    created_at: datetime


class EnrollmentUpdate(BaseModel):
    status: Optional[str] = None


# ── Signal Gate ─────────────────────────────────────────

class SignalGateConditions(BaseModel):
    states: Optional[List[str]] = None
    sources: Optional[List[str]] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    segments: Optional[List[str]] = None
    min_employee_count: Optional[int] = None
    max_employee_count: Optional[int] = None


class SignalGateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    conditions: SignalGateConditions
    enabled: Optional[bool] = True


class SignalGateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    conditions: Optional[SignalGateConditions] = None
    enabled: Optional[bool] = None


class SignalGateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: Optional[str] = None
    conditions: dict
    enabled: bool
    created_by: str
    created_at: datetime
    updated_at: datetime


# ── Priority Queue ──────────────────────────────────────

class PriorityQueueItem(BaseModel):
    account: AccountRead
    priority_score: float
    reasons: List[str]
    recent_signals: List[SignalRead]


class PriorityQueueResponse(BaseModel):
    items: List[PriorityQueueItem]


# ── Outreach (moved from main.py) ───────────────────────

class OutreachGenerateRequest(BaseModel):
    account_id: str
    contact_id: str
