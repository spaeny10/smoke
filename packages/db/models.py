import os
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime, timezone
import uuid
import enum

class SalesStage(enum.Enum):
    NEW = "new"
    CONTACT = "contact"
    ENGINEERING = "engineering"
    PROPOSAL = "proposal"
    WON = "won"
    LOST = "lost"

class DealOrigin(enum.Enum):
    MANUAL = "manual"
    SCRAPED = "scraped"

Base = declarative_base()

def generate_uuid():
    return str(uuid.uuid4())

class Team(Base):
    __tablename__ = 'teams'
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    members = relationship("User", back_populates="team")

class User(Base):
    __tablename__ = 'users'
    id = Column(String, primary_key=True, default=generate_uuid)
    team_id = Column(String, ForeignKey('teams.id'))
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    google_id = Column(String, unique=True)
    password_hash = Column(String, nullable=True)
    role = Column(String, default='rep') # 'rep', 'manager', 'director'
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    team = relationship("Team", back_populates="members")
    assigned_accounts = relationship("Account", back_populates="assigned_rep", foreign_keys="Account.assigned_rep_id")

class Account(Base):
    __tablename__ = 'accounts'
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    name_normalized = Column(String, nullable=False)
    aliases = Column(JSON, default=list) # SQLite JSON for array
    hq_address = Column(String)
    hq_city = Column(String)
    hq_state = Column(String)
    hq_zip = Column(String)
    region = Column(String)
    employee_count = Column(Integer)
    segment = Column(String) # 'Commercial', 'Multifamily', 'Mixed'
    tier = Column(Integer, default=3) # 1=Target, 2=Active Pipeline, 3=General
    composite_score = Column(Float, default=0.0)
    score_trend = Column(String, default='stable')
    deal_stage = Column(String, default='New signal')
    assigned_rep_id = Column(String, ForeignKey('users.id'))
    next_step_text = Column(String)
    next_step_due = Column(DateTime(timezone=True))
    next_step_assignee_id = Column(String, ForeignKey('users.id'))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    assigned_rep = relationship("User", foreign_keys=[assigned_rep_id], back_populates="assigned_accounts")
    contacts = relationship("Contact", back_populates="account", cascade="all, delete-orphan")
    signals = relationship("Signal", back_populates="account", cascade="all, delete-orphan")
    activities = relationship("Activity", back_populates="account", cascade="all, delete-orphan")
    outreach_messages = relationship("OutreachMessage", back_populates="account", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="account", cascade="all, delete-orphan")

class Contact(Base):
    __tablename__ = 'contacts'
    id = Column(String, primary_key=True, default=generate_uuid)
    account_id = Column(String, ForeignKey('accounts.id', ondelete='CASCADE'))
    name = Column(String, nullable=False)
    title = Column(String)
    role_category = Column(String)
    email = Column(String)
    phone = Column(String)
    linkedin_url = Column(String)
    source = Column(String)
    email_verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    account = relationship("Account", back_populates="contacts")
    projects = relationship("Project", back_populates="primary_contact")

class Project(Base):
    __tablename__ = 'projects'
    id = Column(String, primary_key=True, default=generate_uuid)
    account_id = Column(String, ForeignKey('accounts.id', ondelete='CASCADE'))
    primary_contact_id = Column(String, ForeignKey('contacts.id', ondelete='SET NULL'), nullable=True)
    
    name = Column(String, nullable=False) # e.g. "Chicago West Loop Development"
    description = Column(String)
    
    stage = Column(String, default=SalesStage.NEW.value)
    origin = Column(String, default=DealOrigin.MANUAL.value) # manual or scraped
    estimated_value = Column(Float, default=0.0)
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    account = relationship("Account", back_populates="projects")
    primary_contact = relationship("Contact", back_populates="projects")

class Signal(Base):
    __tablename__ = 'signals'
    id = Column(String, primary_key=True, default=generate_uuid)
    account_id = Column(String, ForeignKey('accounts.id', ondelete='CASCADE'))
    source = Column(String, nullable=False)
    signal_type = Column(String, nullable=False)
    heat = Column(String, default='cool')
    status = Column(String, default='new') # 'new', 'viewed', 'actioned', 'dismissed'
    title = Column(String, nullable=False)
    detail = Column(String)
    raw_data = Column(JSON)
    score_contribution = Column(Float, default=0.0)
    external_id = Column(String)
    project_name = Column(String)
    project_value = Column(Float)
    location_city = Column(String)
    location_state = Column(String)
    embedding = Column(JSON) # Mocking vector as JSON array
    detected_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    source_date = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    account = relationship("Account", back_populates="signals")

class Activity(Base):
    __tablename__ = 'activities'
    id = Column(String, primary_key=True, default=generate_uuid)
    account_id = Column(String, ForeignKey('accounts.id', ondelete='CASCADE'))
    contact_id = Column(String, ForeignKey('contacts.id'))
    user_id = Column(String, ForeignKey('users.id'))
    channel = Column(String, nullable=False)
    direction = Column(String, nullable=False)
    summary = Column(String, nullable=False)
    is_auto_logged = Column(Boolean, default=False)
    instantly_message_id = Column(String)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    account = relationship("Account", back_populates="activities")

class OutreachMessage(Base):
    __tablename__ = 'outreach_messages'
    id = Column(String, primary_key=True, default=generate_uuid)
    account_id = Column(String, ForeignKey('accounts.id', ondelete='CASCADE'))
    contact_id = Column(String, ForeignKey('contacts.id'))
    message_text = Column(String, nullable=False)
    persona_angle = Column(String)
    signals_referenced = Column(JSON)
    was_sent = Column(Boolean, default=False)
    was_regenerated = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    account = relationship("Account", back_populates="outreach_messages")

class TwilioLog(Base):
    __tablename__ = 'twilio_logs'
    id = Column(String, primary_key=True, default=generate_uuid)
    activity_id = Column(String, ForeignKey('activities.id', ondelete='CASCADE'))
    message_sid = Column(String)
    status = Column(String)
    error_code = Column(String)
    error_message = Column(String)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class SendGridLog(Base):
    __tablename__ = 'sendgrid_logs'
    id = Column(String, primary_key=True, default=generate_uuid)
    activity_id = Column(String, ForeignKey('activities.id', ondelete='CASCADE'))
    message_id = Column(String)
    event_type = Column(String)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class CompanyAlias(Base):
    __tablename__ = 'company_aliases'
    id = Column(String, primary_key=True, default=generate_uuid)
    alias = Column(String, unique=True, nullable=False)
    account_id = Column(String, ForeignKey('accounts.id', ondelete='CASCADE'))

class SignalGate(Base):
    __tablename__ = 'signal_gates'
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    conditions = Column(JSON, nullable=False, default=dict)
    enabled = Column(Boolean, default=True)
    created_by = Column(String, ForeignKey('users.id'), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    creator = relationship("User")
