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


class GoalAlertInfo(BaseModel):
    alert_type: str
    severity: str
    title: str
    message: str


class GoalEventInfo(BaseModel):
    id: str
    event_type: str
    actor_id: Optional[int] = None
    actor_name: Optional[str] = None
    old_status: Optional[str] = None
    new_status: Optional[str] = None
    comment: Optional[str] = None
    created_at: datetime


class GoalReviewInfo(BaseModel):
    id: str
    verdict: str
    reviewer_id: Optional[int] = None
    reviewer_name: Optional[str] = None
    comment_text: str
    created_at: datetime


class GoalWorkflowActionRequest(BaseModel):
    actor_id: Optional[int] = Field(None, description="Инициатор действия")
    comment: Optional[str] = Field(None, max_length=2000, description="Комментарий")


class GoalMoveRequest(BaseModel):
    target_status: GoalStatusEnum = Field(..., description="Целевой статус цели")
    comment: Optional[str] = Field(None, max_length=2000, description="Комментарий к перемещению")
    actor_id: Optional[int] = Field(None, description="Инициатор действия")


class GoalWorkflowActionResponse(BaseModel):
    message: str
    goal: "GoalResponse"
    available_actions: List[str] = Field(default_factory=list)


class GoalWorkflowResponse(BaseModel):
    goal: "GoalResponse"
    events: List[GoalEventInfo] = Field(default_factory=list)
    reviews: List[GoalReviewInfo] = Field(default_factory=list)
    available_actions: List[str] = Field(default_factory=list)


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
    external_ref: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    # Related data
    employee_name: Optional[str] = None
    department_name: Optional[str] = None
    position_name: Optional[str] = None
    manager_id: Optional[int] = None
    manager_name: Optional[str] = None
    alerts: List[GoalAlertInfo] = Field(default_factory=list)

    class Config:
        from_attributes = True


class GoalListResponse(BaseModel):
    """Schema for list of goals"""
    goals: List[GoalResponse]
    total: int
    page: int = 1
    per_page: int = 20


GoalWorkflowActionResponse.model_rebuild()
GoalWorkflowResponse.model_rebuild()
