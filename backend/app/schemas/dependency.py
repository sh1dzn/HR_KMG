"""Pydantic schemas for dependency graph"""
from typing import Optional, List
from pydantic import BaseModel


class CreateDependencyRequest(BaseModel):
    target_goal_id: str
    dependency_type: str  # "blocks" | "relates_to" | "cascaded_from"


class UpdateDependencyRequest(BaseModel):
    status: str  # "active" | "resolved" | "dismissed"


class GraphNode(BaseModel):
    id: str
    text: str
    status: str
    department: Optional[str] = None
    employee_name: Optional[str] = None
    risk_score: float = 0.0
    is_blocker: bool = False
    dependency_count: int = 0


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    type: str
    status: str


class BlockerInfo(BaseModel):
    goal_id: str
    goal_text: str
    blocked_count: int
    status: str
    department: Optional[str] = None


class DependencyGraphResponse(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    blockers: List[BlockerInfo]


class DependencySuggestion(BaseModel):
    target_goal_id: str
    target_text: str
    target_department: Optional[str] = None
    type: str
    confidence: float
    reason: str


class SuggestDependenciesResponse(BaseModel):
    suggestions: List[DependencySuggestion]
