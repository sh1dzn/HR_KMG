"""
Prediction service — statistical risk scoring for goal failure.
"""
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Goal, GoalEvent, GoalEventType, GoalStatus, Employee
from app.utils.smart_heuristics import evaluate_goal_heuristically


def _risk_level(score: float) -> str:
    if score > 0.7:
        return "high"
    if score >= 0.4:
        return "medium"
    return "low"


def compute_risk_score(goal: Goal, db: Session) -> dict:
    """Compute statistical risk score for a single goal."""
    heuristic = evaluate_goal_heuristically(goal.goal_text, goal.metric, goal.deadline, goal.priority)
    smart_score = heuristic["overall_score"]

    # Rejection count
    events = db.query(GoalEvent).filter(
        GoalEvent.goal_id == str(goal.goal_id),
        GoalEvent.event_type == GoalEventType.REJECTED,
    ).all()
    rejection_count = len(events)

    # Days in current status (stagnation)
    last_event = db.query(GoalEvent).filter(
        GoalEvent.goal_id == str(goal.goal_id),
    ).order_by(GoalEvent.created_at.desc()).first()
    if last_event:
        days_in_status = (datetime.now(timezone.utc) - last_event.created_at).days
    else:
        days_in_status = (datetime.now(timezone.utc) - goal.created_at).days if goal.created_at else 0

    # Deadline pressure
    today = date.today()
    if goal.deadline:
        if goal.deadline < today:
            deadline_pressure = 1.0
            deadline_label = f"Просрочена на {(today - goal.deadline).days} дн."
        else:
            total_days = (goal.deadline - goal.created_at.date()).days if goal.created_at else 90
            total_days = max(total_days, 1)
            days_remaining = (goal.deadline - today).days
            deadline_pressure = round(max(0, 1 - (days_remaining / total_days)), 2)
            deadline_label = f"До дедлайна {days_remaining} дн."
    else:
        deadline_pressure = 0.3
        deadline_label = "Дедлайн не указан"

    # Department history
    dept_total = db.query(Goal).filter(
        Goal.department_id == goal.department_id,
        Goal.year < goal.year if goal.year else True,
    ).count()
    dept_done = db.query(Goal).filter(
        Goal.department_id == goal.department_id,
        Goal.year < goal.year if goal.year else True,
        Goal.status.in_([GoalStatus.DONE]),
    ).count()
    if dept_total > 0:
        dept_history_factor = round(1 - (dept_done / dept_total), 2)
        dept_label = f"Отдел выполняет {round(dept_done / dept_total * 100)}% целей"
    else:
        dept_history_factor = 0.5
        dept_label = "Нет истории отдела"

    # Factors
    factors = [
        {"name": "smart_quality", "value": round(1 - smart_score, 2), "weight": 0.20,
         "label": f"SMART-скор {smart_score}"},
        {"name": "rejections", "value": round(min(rejection_count / 3, 1.0), 2), "weight": 0.20,
         "label": f"Отклонена {rejection_count} раз(а)" if rejection_count else "Не отклонялась"},
        {"name": "stagnation", "value": round(min(days_in_status / 30, 1.0), 2), "weight": 0.20,
         "label": f"В текущем статусе {days_in_status} дн."},
        {"name": "deadline_pressure", "value": deadline_pressure, "weight": 0.25,
         "label": deadline_label},
        {"name": "dept_history", "value": dept_history_factor, "weight": 0.15,
         "label": dept_label},
    ]

    risk_score = round(sum(f["value"] * f["weight"] for f in factors), 2)

    return {
        "goal_id": str(goal.goal_id),
        "risk_score": risk_score,
        "risk_level": _risk_level(risk_score),
        "factors": [{"name": f["name"], "value": f["value"], "label": f["label"]} for f in factors],
        "explanation": None,
    }


async def explain_risk(goal: Goal, factors: list[dict]) -> dict:
    """Use LLM to explain risk and suggest recommendations."""
    try:
        from app.services.llm_service import llm_service

        factors_text = "\n".join(f"- {f['name']}: {f['value']} ({f['label']})" for f in factors)
        prompt = (
            f"Цель сотрудника: \"{goal.goal_text}\"\n\n"
            f"Факторы риска:\n{factors_text}\n\n"
            f"Объясни на русском почему эта цель может быть не выполнена (2-3 предложения). "
            f"Дай 2-3 конкретные рекомендации. "
            f"Верни JSON: {{\"explanation\": \"...\", \"recommendations\": [\"...\", \"...\"]}}"
        )
        result = await llm_service.complete_json(prompt, system_prompt="Ты HR-аналитик.")
        if isinstance(result, dict):
            return {
                "explanation": result.get("explanation", ""),
                "recommendations": result.get("recommendations", []),
            }
    except Exception:
        pass

    # Fallback
    high_factors = [f for f in factors if f["value"] > 0.5]
    explanation = "Основные факторы риска: " + ", ".join(f["label"].lower() for f in high_factors) + "." if high_factors else "Умеренный уровень риска."
    return {"explanation": explanation, "recommendations": []}
