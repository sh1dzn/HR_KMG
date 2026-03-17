"""
Alert schemas for goal quality notifications and alert manager feed.
"""
from pydantic import BaseModel, Field
from typing import List, Optional


class AlertItem(BaseModel):
    id: str
    severity: str = Field(..., description="low/medium/high")
    alert_type: str = Field(..., description="Тип алерта")
    title: str
    message: str
    recommended_action: str
    employee_id: int
    employee_name: str
    manager_id: Optional[int] = None
    manager_name: Optional[str] = None
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    goal_id: Optional[str] = None
    goal_title: Optional[str] = None
    quarter: Optional[str] = None
    year: Optional[int] = None
    recipient_roles: List[str] = Field(default_factory=list)


class AlertsSummaryResponse(BaseModel):
    total_alerts: int
    high_severity: int
    medium_severity: int
    low_severity: int
    alerts_by_type: dict
    alerts: List[AlertItem]
    quarter: Optional[str] = None
    year: Optional[int] = None
    page: int = 1
    per_page: int = 50
    total_pages: int = 1
