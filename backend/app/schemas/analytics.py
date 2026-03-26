"""
Pydantic schemas for analytics endpoints: heatmap, benchmark, 1-on-1 agenda
"""
from typing import Optional, List, Dict
from datetime import datetime
from pydantic import BaseModel, Field


# ── Heatmap ──────────────────────────────────────────────────────────────────

class HeatmapEmployee(BaseModel):
    id: int
    name: str
    value: float
    goals_count: int


class HeatmapDepartment(BaseModel):
    id: int
    name: str
    employee_count: int
    value: float
    breakdown: Dict[str, float]  # {"smart": 0.68, "maturity": 0.72, "progress": 0.55}
    employees: List[HeatmapEmployee]


class HeatmapResponse(BaseModel):
    departments: List[HeatmapDepartment]
    org_average: float
    mode: str


# ── Benchmark ────────────────────────────────────────────────────────────────

class BenchmarkDepartment(BaseModel):
    rank: int
    department_id: int
    department_name: str
    maturity: float
    avg_smart: float
    delta_from_avg: float
    smart_criteria: Dict[str, float]  # {"S": 0.81, "M": 0.75, ...}
    goal_count: int
    employee_count: int
    top_goals: List[str]


class BenchmarkOrgAverage(BaseModel):
    maturity: float
    avg_smart: float
    smart_criteria: Dict[str, float]


class BenchmarkResponse(BaseModel):
    ranking: List[BenchmarkDepartment]
    org_average: BenchmarkOrgAverage


# ── 1-on-1 Agenda ───────────────────────────────────────────────────────────

class OneOnOneAgendaRequest(BaseModel):
    employee_id: int
    quarter: str = Field(..., pattern=r"^Q[1-4]$")
    year: int


class AgendaItem(BaseModel):
    topic: str
    goal_id: Optional[str] = None
    goal_text: Optional[str] = None
    context: str
    suggested_questions: List[str] = []
    priority: str  # "high" | "medium" | "low"


class AgendaSummary(BaseModel):
    total_goals: int
    avg_smart: float
    overdue: int
    rejected_count: int
    alerts_count: int


class OneOnOneAgendaResponse(BaseModel):
    employee_name: str
    manager_name: Optional[str] = None
    generated_at: datetime
    agenda: List[AgendaItem]
    summary: AgendaSummary
