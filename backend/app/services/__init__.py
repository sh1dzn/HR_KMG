"""
AI Services for HR Goal Management
"""

LLMService = None
SMARTEvaluator = None
RAGService = None
GoalGenerator = None

try:
    from app.services.llm_service import LLMService  # type: ignore
except Exception:
    pass

try:
    from app.services.smart_evaluator import SMARTEvaluator  # type: ignore
except Exception:
    pass

try:
    from app.services.rag_service import RAGService  # type: ignore
except Exception:
    pass

try:
    from app.services.goal_generator import GoalGenerator  # type: ignore
except Exception:
    pass

__all__ = [
    "LLMService",
    "SMARTEvaluator",
    "RAGService",
    "GoalGenerator"
]
