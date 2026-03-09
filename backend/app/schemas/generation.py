"""
Goal generation schemas
"""
from pydantic import BaseModel, Field
from typing import Optional, List


class SourceDocument(BaseModel):
    """Source document reference"""
    doc_id: int = Field(..., description="ID документа")
    title: str = Field(..., description="Название документа")
    doc_type: str = Field(..., description="Тип документа")
    relevant_fragment: str = Field(..., description="Релевантный фрагмент текста")


class GenerationRequest(BaseModel):
    """Request for goal generation"""
    employee_id: int = Field(..., description="ID сотрудника")
    position: Optional[str] = Field(None, description="Должность (если не указана, берётся из профиля)")
    department: Optional[str] = Field(None, description="Подразделение (если не указано, берётся из профиля)")
    quarter: str = Field(..., pattern="^Q[1-4]$", description="Квартал (Q1-Q4)")
    year: int = Field(..., ge=2020, le=2030, description="Год")
    focus_areas: Optional[List[str]] = Field(None, description="Фокус-направления (цифровизация, снижение затрат и т.д.)")
    manager_goals: Optional[List[str]] = Field(None, description="Цели руководителя для каскадирования")
    count: int = Field(default=3, ge=1, le=5, description="Количество целей для генерации")


class GeneratedGoal(BaseModel):
    """Single generated goal"""
    goal_text: str = Field(..., description="Сформулированная цель")
    metric: str = Field(..., description="Показатель достижения")
    smart_score: float = Field(..., ge=0.0, le=1.0, description="SMART-индекс")
    goal_type: str = Field(..., description="Тип цели")
    goal_type_russian: str = Field(..., description="Тип цели на русском")
    strategic_link: str = Field(..., description="Уровень стратегической связки")
    strategic_link_russian: str = Field(..., description="Связка на русском")
    source_document: SourceDocument = Field(..., description="Источник цели")
    rationale: str = Field(..., description="Обоснование предложения цели")
    suggested_weight: float = Field(..., ge=0.0, le=100.0, description="Рекомендуемый вес")


class GenerationResponse(BaseModel):
    """Response with generated goals"""
    employee_id: int
    employee_name: str
    position: str
    department: str
    quarter: str
    year: int
    generated_goals: List[GeneratedGoal]
    total_suggested_weight: float = Field(..., description="Сумма рекомендуемых весов")
    generation_context: str = Field(..., description="Контекст генерации")


class DepartmentStats(BaseModel):
    """Department goal statistics"""
    department_id: int
    department_name: str
    total_employees: int
    total_goals: int
    average_smart_score: float
    goals_by_status: dict
    goals_by_type: dict
    goals_by_strategic_link: dict
    weak_criteria: List[str] = Field(default=[], description="Наиболее слабые критерии SMART")
    maturity_index: float = Field(..., ge=0.0, le=1.0, description="Индекс зрелости целеполагания")


class DashboardSummary(BaseModel):
    """Dashboard summary data"""
    total_departments: int
    total_employees: int
    total_goals: int
    average_smart_score: float
    strategic_goals_percent: float
    functional_goals_percent: float
    operational_goals_percent: float
    departments_stats: List[DepartmentStats]
    top_issues: List[str]
    quarter: Optional[str]
    year: Optional[int]
