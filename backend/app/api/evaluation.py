"""
Evaluation API endpoints
Оценка целей по методологии SMART
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import Goal, Employee
from app.schemas.evaluation import (
    EvaluationRequest,
    EvaluationResponse,
    BatchEvaluationRequest,
    BatchEvaluationResponse,
    GoalEvaluationSummary
)
from app.services.smart_evaluator import smart_evaluator
from app.config import settings

router = APIRouter()


@router.post("/evaluate", response_model=EvaluationResponse)
async def evaluate_goal(request: EvaluationRequest):
    """
    Оценить цель по методологии SMART

    Анализирует текст цели и возвращает:
    - Оценку по каждому критерию SMART (0.0-1.0)
    - Общий индекс качества
    - Классификацию типа цели
    - Уровень стратегической связки
    - Рекомендации по улучшению
    - Переформулированную цель
    """
    evaluation = await smart_evaluator.evaluate_goal(
        goal_text=request.goal_text,
        position=request.position,
        department=request.department,
        context=request.context
    )

    return evaluation


@router.post("/evaluate-batch", response_model=BatchEvaluationResponse)
async def evaluate_batch(
    request: BatchEvaluationRequest,
    db: Session = Depends(get_db)
):
    """
    Пакетная оценка целей сотрудника

    Оценивает все цели сотрудника за указанный период и возвращает:
    - Оценку каждой цели
    - Средний индекс качества
    - Проверку суммы весов (должна быть 100%)
    - Проверку количества целей (3-5)
    - Топ проблем и рекомендации
    """
    # Get employee
    employee = db.query(Employee).filter(Employee.id == request.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    # Get goals
    query = db.query(Goal).filter(Goal.employee_id == request.employee_id)
    if request.quarter:
        query = query.filter(Goal.quarter == request.quarter)
    if request.year:
        query = query.filter(Goal.year == request.year)

    goals = query.all()

    if not goals:
        raise HTTPException(
            status_code=404,
            detail="Цели не найдены для указанного периода"
        )

    # Evaluate each goal
    evaluations = []
    all_issues = []
    total_score = 0
    total_weight = 0

    for goal in goals:
        evaluation = await smart_evaluator.evaluate_goal(
            goal_text=goal.title,
            position=employee.position.name if employee.position else None,
            department=employee.department.name if employee.department else None
        )

        # Collect issues
        main_issues = []
        smart = evaluation.smart_evaluation
        if smart.specific.score < 0.7:
            main_issues.append("Недостаточно конкретная")
        if smart.measurable.score < 0.7:
            main_issues.append("Нет измеримых показателей")
        if smart.achievable.score < 0.7:
            main_issues.append("Сомнения в достижимости")
        if smart.relevant.score < 0.7:
            main_issues.append("Слабая связь с ролью")
        if smart.time_bound.score < 0.7:
            main_issues.append("Не указан срок")

        all_issues.extend(main_issues)

        evaluations.append(GoalEvaluationSummary(
            goal_id=goal.id,
            goal_text=goal.title,
            overall_score=evaluation.overall_score,
            quality_level=evaluation.quality_level,
            main_issues=main_issues
        ))

        total_score += evaluation.overall_score
        total_weight += goal.weight or 0

        # Update goal with evaluation
        goal.smart_score = evaluation.overall_score
        goal.smart_details = {
            "specific": evaluation.smart_evaluation.specific.model_dump(),
            "measurable": evaluation.smart_evaluation.measurable.model_dump(),
            "achievable": evaluation.smart_evaluation.achievable.model_dump(),
            "relevant": evaluation.smart_evaluation.relevant.model_dump(),
            "time_bound": evaluation.smart_evaluation.time_bound.model_dump()
        }
        goal.goal_type = evaluation.goal_type.type
        if evaluation.strategic_link:
            goal.strategic_link = evaluation.strategic_link.level

    db.commit()

    # Calculate aggregates
    average_score = total_score / len(goals) if goals else 0
    weight_valid = abs(total_weight - 100) < 0.1
    goals_count_valid = settings.MIN_GOALS_PER_EMPLOYEE <= len(goals) <= settings.MAX_GOALS_PER_EMPLOYEE

    # Get top issues
    issue_counts = {}
    for issue in all_issues:
        issue_counts[issue] = issue_counts.get(issue, 0) + 1
    top_issues = sorted(issue_counts.keys(), key=lambda x: issue_counts[x], reverse=True)[:5]

    # Generate recommendations
    recommendations = []
    if not weight_valid:
        recommendations.append(f"Сумма весов целей ({total_weight:.0f}%) должна равняться 100%")
    if not goals_count_valid:
        if len(goals) < settings.MIN_GOALS_PER_EMPLOYEE:
            recommendations.append(f"Рекомендуется добавить цели (минимум {settings.MIN_GOALS_PER_EMPLOYEE})")
        else:
            recommendations.append(f"Рекомендуется сократить количество целей (максимум {settings.MAX_GOALS_PER_EMPLOYEE})")
    if average_score < settings.SMART_THRESHOLD_MEDIUM:
        recommendations.append("Рекомендуется доработать формулировки целей для повышения качества")

    return BatchEvaluationResponse(
        employee_id=employee.id,
        employee_name=employee.full_name,
        quarter=request.quarter,
        year=request.year,
        goals_evaluated=evaluations,
        total_goals=len(goals),
        average_score=round(average_score, 2),
        total_weight=total_weight,
        weight_valid=weight_valid,
        goals_count_valid=goals_count_valid,
        top_issues=top_issues,
        recommendations=recommendations
    )


@router.post("/reformulate")
async def reformulate_goal(request: EvaluationRequest):
    """
    Предложить улучшенную формулировку цели

    Возвращает переформулированную цель, соответствующую SMART-критериям
    """
    evaluation = await smart_evaluator.evaluate_goal(
        goal_text=request.goal_text,
        position=request.position,
        department=request.department,
        context=request.context
    )

    return {
        "original_goal": request.goal_text,
        "original_score": evaluation.overall_score,
        "reformulated_goal": evaluation.reformulated_goal,
        "improvements": evaluation.recommendations,
        "quality_improvement": "Переформулированная цель соответствует SMART-критериям"
    }
