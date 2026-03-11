"""
Goal-related schemas
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class GoalStatusEnum(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    CANCELLED = "cancelled"
    OVERDUE = "overdue"
    ARCHIVED = "archived"


class GoalBase(BaseModel):
    """Base goal schema"""
    title: str = Field(..., min_length=10, max_length=500, description="Формулировка цели")
    description: Optional[str] = Field(None, description="Описание цели")
    metric: Optional[str] = Field(None, description="Показатель достижения")
    deadline: Optional[datetime] = Field(None, description="Срок выполнения")
    weight: float = Field(default=0.0, ge=0.0, le=100.0, description="Вес цели в %")
    quarter: Optional[str] = Field(None, pattern="^Q[1-4]$", description="Квартал (Q1-Q4)")
    year: Optional[int] = Field(None, ge=2020, le=2030, description="Год")


class GoalCreate(GoalBase):
    """Schema for creating a goal"""
    employee_id: int = Field(..., description="ID сотрудника")


class GoalUpdate(BaseModel):
    """Schema for updating a goal"""
    title: Optional[str] = Field(None, min_length=10, max_length=500)
    description: Optional[str] = None
    metric: Optional[str] = None
    deadline: Optional[datetime] = None
    weight: Optional[float] = Field(None, ge=0.0, le=100.0)
    status: Optional[GoalStatusEnum] = None
    quarter: Optional[str] = None
    year: Optional[int] = None


class GoalResponse(GoalBase):
    """Schema for goal response"""
    id: str
    employee_id: int
    status: GoalStatusEnum
    smart_score: Optional[float] = None
    smart_details: Optional[dict] = None
    goal_type: Optional[str] = None
    strategic_link: Optional[str] = None
    source_document_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    # Related data
    employee_name: Optional[str] = None
    department_name: Optional[str] = None
    position_name: Optional[str] = None

    class Config:
        from_attributes = True


class GoalListResponse(BaseModel):
    """Schema for list of goals"""
    goals: List[GoalResponse]
    total: int
    page: int = 1
    per_page: int = 20
