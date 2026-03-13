"""
Schemas for mock HR system integrations.
"""
from pydantic import BaseModel, Field
from typing import List, Optional


class IntegrationSystemInfo(BaseModel):
    code: str
    name: str
    description: str
    status: str


class IntegrationSystemsResponse(BaseModel):
    systems: List[IntegrationSystemInfo]


class GoalsExportRequest(BaseModel):
    employee_id: int = Field(..., description="ID сотрудника")
    quarter: Optional[str] = Field(None, pattern="^Q[1-4]$", description="Квартал")
    year: Optional[int] = Field(None, ge=2020, le=2030, description="Год")
    target_system: str = Field(..., description="1c/sap/oracle")
    include_drafts: bool = Field(True, description="Включать черновики")


class GoalExportReference(BaseModel):
    goal_id: str
    external_ref: str


class GoalsExportResponse(BaseModel):
    batch_id: str
    target_system: str
    employee_id: int
    employee_name: str
    exported_count: int
    message: str
    payload: dict
    goal_refs: List[GoalExportReference]
