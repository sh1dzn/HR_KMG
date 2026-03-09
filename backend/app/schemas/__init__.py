"""
Pydantic schemas for API requests and responses
"""
from app.schemas.goal import (
    GoalCreate,
    GoalUpdate,
    GoalResponse,
    GoalListResponse
)
from app.schemas.evaluation import (
    SMARTCriterion,
    SMARTEvaluation,
    EvaluationRequest,
    EvaluationResponse,
    BatchEvaluationRequest,
    BatchEvaluationResponse
)
from app.schemas.generation import (
    GenerationRequest,
    GeneratedGoal,
    GenerationResponse
)

__all__ = [
    "GoalCreate",
    "GoalUpdate",
    "GoalResponse",
    "GoalListResponse",
    "SMARTCriterion",
    "SMARTEvaluation",
    "EvaluationRequest",
    "EvaluationResponse",
    "BatchEvaluationRequest",
    "BatchEvaluationResponse",
    "GenerationRequest",
    "GeneratedGoal",
    "GenerationResponse"
]
