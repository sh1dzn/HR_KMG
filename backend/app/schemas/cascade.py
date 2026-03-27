"""Pydantic schemas for cascade operations"""
from typing import Optional, List
from pydantic import BaseModel


class CascadePreviewRequest(BaseModel):
    target_department_ids: List[int]
    goals_per_department: int = 2


class CascadedGoalItem(BaseModel):
    text: str
    suggested_weight: float
    rationale: str


class CascadedDepartment(BaseModel):
    department_id: int
    department_name: str
    goals: List[CascadedGoalItem]


class ConflictGoalRef(BaseModel):
    text: str
    department: str


class ConflictItem(BaseModel):
    type: str  # "contradiction" | "duplicate" | "resource"
    goal_a: ConflictGoalRef
    goal_b: ConflictGoalRef
    explanation: str


class CascadePreviewResponse(BaseModel):
    source_goal: dict  # {"id": str, "text": str}
    cascaded_goals: List[CascadedDepartment]
    conflicts: List[ConflictItem]
    conflict_count: int


class CascadeConfirmGoal(BaseModel):
    department_id: int
    employee_id: int
    text: str
    weight: float
    quarter: str
    year: int


class CascadeConfirmRequest(BaseModel):
    goals: List[CascadeConfirmGoal]


class CascadeConfirmResponse(BaseModel):
    created_count: int
    goal_ids: List[str]
