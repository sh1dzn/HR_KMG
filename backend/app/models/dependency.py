"""GoalDependency model for tracking goal relationships"""
import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import Column, DateTime, ForeignKey, CheckConstraint, UniqueConstraint
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class DependencyType(str, Enum):
    BLOCKS = "blocks"
    RELATES_TO = "relates_to"
    CASCADED_FROM = "cascaded_from"


class DependencyStatus(str, Enum):
    ACTIVE = "active"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class DependencyCreatedBy(str, Enum):
    MANUAL = "manual"
    AI_SUGGESTED = "ai_suggested"
    CASCADE = "cascade"


class GoalDependency(Base):
    __tablename__ = "goal_dependencies"
    __table_args__ = (
        UniqueConstraint("source_goal_id", "target_goal_id", name="uq_goal_dependency"),
        CheckConstraint("source_goal_id != target_goal_id", name="ck_no_self_dependency"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_goal_id = Column(UUID(as_uuid=False), ForeignKey("goals.goal_id"), nullable=False, index=True)
    target_goal_id = Column(UUID(as_uuid=False), ForeignKey("goals.goal_id"), nullable=False, index=True)
    dependency_type = Column(
        SQLEnum(DependencyType, name="dependency_type_enum", values_callable=lambda e: [i.value for i in e]),
        nullable=False,
    )
    status = Column(
        SQLEnum(DependencyStatus, name="dependency_status_enum", values_callable=lambda e: [i.value for i in e]),
        nullable=False,
        default=DependencyStatus.ACTIVE,
    )
    created_by = Column(
        SQLEnum(DependencyCreatedBy, name="dependency_created_by_enum", values_callable=lambda e: [i.value for i in e]),
        nullable=False,
        default=DependencyCreatedBy.MANUAL,
    )
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    source_goal = relationship("Goal", foreign_keys=[source_goal_id])
    target_goal = relationship("Goal", foreign_keys=[target_goal_id])
