"""
Goal, GoalEvent, and GoalReview models
"""
from sqlalchemy import Column, BigInteger, Text, Date, DateTime, ForeignKey, Enum as SQLEnum, Numeric
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from enum import Enum
from app.database import Base


def _pg_enum(enum_cls, name: str):
    return SQLEnum(
        enum_cls,
        name=name,
        values_callable=lambda values: [item.value for item in values],
    )


class GoalStatus(str, Enum):
    """Goal status enumeration"""
    DRAFT = "draft"
    ACTIVE = "active"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    CANCELLED = "cancelled"
    OVERDUE = "overdue"
    ARCHIVED = "archived"


class GoalEventType(str, Enum):
    CREATED = "created"
    EDITED = "edited"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"
    STATUS_CHANGED = "status_changed"
    COMMENTED = "commented"
    ARCHIVED = "archived"


class ReviewVerdict(str, Enum):
    APPROVE = "approve"
    REJECT = "reject"
    NEEDS_CHANGES = "needs_changes"
    COMMENT_ONLY = "comment_only"


class Quarter(str, Enum):
    Q1 = "Q1"
    Q2 = "Q2"
    Q3 = "Q3"
    Q4 = "Q4"


class Goal(Base):
    """Employee goal model"""
    __tablename__ = "goals"

    goal_id = Column(UUID(as_uuid=False), primary_key=True, index=True)
    employee_id = Column(BigInteger, ForeignKey("employees.id"), nullable=False)
    department_id = Column(BigInteger, ForeignKey("departments.id"), nullable=False)
    employee_name_snapshot = Column(Text, nullable=True)
    position_snapshot = Column(Text, nullable=True)
    department_name_snapshot = Column(Text, nullable=True)
    project_id = Column(UUID(as_uuid=False), nullable=True)
    system_id = Column(BigInteger, nullable=True)
    goal_text = Column(Text, nullable=False)
    metric = Column(Text, nullable=True)
    deadline = Column(Date, nullable=True)
    weight = Column(Numeric(5, 2), default=1.0)
    status = Column(_pg_enum(GoalStatus, "goal_status_enum"), default=GoalStatus.DRAFT, nullable=False)
    quarter = Column(_pg_enum(Quarter, "quarter_enum"), nullable=False)
    year = Column(BigInteger, nullable=False)
    external_ref = Column(Text, nullable=True)
    priority = Column(BigInteger, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)

    # Relationships
    employee = relationship("Employee", back_populates="goals")
    department = relationship("Department")
    events = relationship("GoalEvent", back_populates="goal")
    reviews = relationship("GoalReview", back_populates="goal")

    def __repr__(self):
        return f"<Goal(goal_id={self.goal_id}, text='{self.goal_text[:50]}...', status={self.status})>"


class GoalEvent(Base):
    """Goal event/history model"""
    __tablename__ = "goal_events"

    id = Column(UUID(as_uuid=False), primary_key=True, index=True)
    goal_id = Column(UUID(as_uuid=False), ForeignKey("goals.goal_id"), nullable=False)
    event_type = Column(_pg_enum(GoalEventType, "goal_event_type_enum"), nullable=False)
    actor_id = Column(BigInteger, ForeignKey("employees.id"), nullable=True)
    old_status = Column(_pg_enum(GoalStatus, "goal_status_enum"), nullable=True)
    new_status = Column(_pg_enum(GoalStatus, "goal_status_enum"), nullable=True)
    old_text = Column(Text, nullable=True)
    new_text = Column(Text, nullable=True)
    event_metadata = Column("metadata", JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False)

    # Relationships
    goal = relationship("Goal", back_populates="events")
    actor = relationship("Employee")

    def __repr__(self):
        return f"<GoalEvent(id={self.id}, goal_id={self.goal_id}, type='{self.event_type}')>"


class GoalReview(Base):
    """Goal review model"""
    __tablename__ = "goal_reviews"

    id = Column(UUID(as_uuid=False), primary_key=True, index=True)
    goal_id = Column(UUID(as_uuid=False), ForeignKey("goals.goal_id"), nullable=False)
    reviewer_id = Column(BigInteger, ForeignKey("employees.id"), nullable=True)
    verdict = Column(_pg_enum(ReviewVerdict, "review_verdict_enum"), nullable=False)
    comment_text = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)

    # Relationships
    goal = relationship("Goal", back_populates="reviews")
    reviewer = relationship("Employee")

    def __repr__(self):
        return f"<GoalReview(id={self.id}, goal_id={self.goal_id}, verdict='{self.verdict}')>"
