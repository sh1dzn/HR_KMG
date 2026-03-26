"""Pydantic schemas for goal failure prediction"""
from typing import Optional, List
from pydantic import BaseModel


class RiskFactor(BaseModel):
    name: str
    value: float
    label: str


class PredictionResponse(BaseModel):
    goal_id: str
    risk_score: float
    risk_level: str  # "high" | "medium" | "low"
    factors: List[RiskFactor]
    explanation: Optional[str] = None


class ExplanationResponse(BaseModel):
    explanation: str
    recommendations: List[str]


class RiskGoalItem(BaseModel):
    goal_id: str
    goal_text: str
    employee_name: Optional[str] = None
    department: Optional[str] = None
    risk_score: float


class RiskOverviewResponse(BaseModel):
    total_goals: int
    risk_distribution: dict  # {"high": N, "medium": N, "low": N}
    top_risks: List[RiskGoalItem]
