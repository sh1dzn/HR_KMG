"""
Goal, GoalEvent, and GoalReview models
"""
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey, Enum as SQLEnum, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from enum import Enum
from app.database import Base


class GoalStatus(str, Enum):
    """Goal status enumeration"""
    DRAFT = "draft"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    COMPLETED = "completed"


class GoalType(str, Enum):
    """Goal type classification"""
    ACTIVITY = "activity"
    OUTPUT = "output"
    IMPACT = "impact"


class StrategicLink(str, Enum):
    """Strategic link level"""
    STRATEGIC = "strategic"
    FUNCTIONAL = "functional"
    OPERATIONAL = "operational"


class Goal(Base):
    """Employee goal model"""
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    metric = Column(String(255), nullable=True)
    deadline = Column(DateTime, nullable=True)
    weight = Column(Float, default=0.0)
    status = Column(SQLEnum(GoalStatus), default=GoalStatus.DRAFT)
    quarter = Column(String(10), nullable=True)  # Q1, Q2, Q3, Q4
    year = Column(Integer, nullable=True)

    # AI evaluation fields
    smart_score = Column(Float, nullable=True)
    smart_details = Column(JSON, nullable=True)
    goal_type = Column(SQLEnum(GoalType), nullable=True)
    strategic_link = Column(SQLEnum(StrategicLink), nullable=True)
    source_document_id = Column(Integer, ForeignKey("documents.doc_id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    employee = relationship("Employee", back_populates="goals")
    source_document = relationship("Document")
    events = relationship("GoalEvent", back_populates="goal")
    reviews = relationship("GoalReview", back_populates="goal")

    def __repr__(self):
        return f"<Goal(id={self.id}, title='{self.title[:50]}...', status={self.status})>"


class GoalEvent(Base):
    """Goal event/history model"""
    __tablename__ = "goal_events"

    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(Integer, ForeignKey("goals.id"), nullable=False)
    event_type = Column(String(50), nullable=False)
    actor_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    old_status = Column(SQLEnum(GoalStatus), nullable=True)
    new_status = Column(SQLEnum(GoalStatus), nullable=True)
    old_text = Column(Text, nullable=True)
    new_text = Column(Text, nullable=True)
    event_metadata = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    goal = relationship("Goal", back_populates="events")
    actor = relationship("Employee")

    def __repr__(self):
        return f"<GoalEvent(id={self.id}, goal_id={self.goal_id}, type='{self.event_type}')>"


class GoalReview(Base):
    """Goal review model"""
    __tablename__ = "goal_reviews"

    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(Integer, ForeignKey("goals.id"), nullable=False)
    reviewer_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    verdict = Column(String(50), nullable=False)  # approved, rejected, needs_revision
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    goal = relationship("Goal", back_populates="reviews")
    reviewer = relationship("Employee")

    def __repr__(self):
        return f"<GoalReview(id={self.id}, goal_id={self.goal_id}, verdict='{self.verdict}')>"
