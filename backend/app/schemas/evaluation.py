"""
SMART evaluation schemas
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum


class SMARTCriterion(BaseModel):
    """Single SMART criterion evaluation"""
    score: float = Field(..., ge=0.0, le=1.0, description="Оценка критерия (0.0-1.0)")
    comment: str = Field(..., description="Комментарий к оценке")
    is_satisfied: bool = Field(default=False, description="Критерий выполнен")


class SMARTEvaluation(BaseModel):
    """Complete SMART evaluation"""
    specific: SMARTCriterion = Field(..., description="S - Конкретность")
    measurable: SMARTCriterion = Field(..., description="M - Измеримость")
    achievable: SMARTCriterion = Field(..., description="A - Достижимость")
    relevant: SMARTCriterion = Field(..., description="R - Релевантность")
    time_bound: SMARTCriterion = Field(..., description="T - Ограниченность во времени")


class GoalTypeInfo(BaseModel):
    """Goal type classification"""
    type: str = Field(..., description="Тип цели: activity/output/impact")
    type_russian: str = Field(..., description="Тип цели на русском")
    explanation: str = Field(..., description="Пояснение к типу")


class StrategicLinkInfo(BaseModel):
    """Strategic link information"""
    level: str = Field(..., description="Уровень связки: strategic/functional/operational")
    level_russian: str = Field(..., description="Уровень на русском")
    explanation: str = Field(..., description="Пояснение к связке")
    source: Optional[str] = Field(None, description="Источник связки")


class EvaluationRequest(BaseModel):
    """Request for goal evaluation"""
    goal_text: str = Field(..., min_length=10, description="Текст цели для оценки")
    position: Optional[str] = Field(None, description="Должность сотрудника")
    department: Optional[str] = Field(None, description="Подразделение")
    context: Optional[str] = Field(None, description="Дополнительный контекст")


class EvaluationResponse(BaseModel):
    """Response with goal evaluation"""
    goal_text: str = Field(..., description="Исходный текст цели")
    smart_evaluation: SMARTEvaluation = Field(..., description="Оценка по SMART")
    overall_score: float = Field(..., ge=0.0, le=1.0, description="Общий индекс качества")
    goal_type: GoalTypeInfo = Field(..., description="Классификация типа цели")
    strategic_link: Optional[StrategicLinkInfo] = Field(None, description="Стратегическая связка")
    recommendations: List[str] = Field(default=[], description="Рекомендации по улучшению")
    reformulated_goal: Optional[str] = Field(None, description="Переформулированная цель")
    quality_level: str = Field(..., description="Уровень качества: low/medium/high")


class BatchEvaluationRequest(BaseModel):
    """Request for batch goal evaluation"""
    employee_id: int = Field(..., description="ID сотрудника")
    quarter: Optional[str] = Field(None, description="Квартал")
    year: Optional[int] = Field(None, description="Год")


class GoalEvaluationSummary(BaseModel):
    """Summary evaluation for a single goal in batch"""
    goal_id: str
    goal_text: str
    overall_score: float
    quality_level: str
    main_issues: List[str]


class BatchEvaluationResponse(BaseModel):
    """Response with batch evaluation results"""
    employee_id: int
    employee_name: str
    quarter: Optional[str]
    year: Optional[int]
    goals_evaluated: List[GoalEvaluationSummary]
    total_goals: int
    average_score: float
    total_weight: float
    weight_valid: bool = Field(..., description="Сумма весов равна 100%")
    goals_count_valid: bool = Field(..., description="Количество целей в норме (3-5)")
    top_issues: List[str] = Field(default=[], description="Топ проблем по всем целям")
    recommendations: List[str] = Field(default=[], description="Общие рекомендации")
