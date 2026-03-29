"""
Dashboard API endpoints
"""
import threading
import time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Any, Optional
from app.database import get_db
from app.dependencies.auth import require_role
from app.models.user import User
from app.models import Goal, Employee, Department, GoalStatus
from app.schemas.generation import DepartmentStats, DashboardSummary
from app.config import settings
from app.utils.goal_context import goal_type_for_goal, load_generation_metadata, strategic_link_for_goal
from app.utils.smart_heuristics import evaluate_goal_heuristically

router = APIRouter()

_SUMMARY_CACHE_TTL_SECONDS = 30.0
_SUMMARY_CACHE: dict[tuple[Optional[str], Optional[int]], tuple[float, Any]] = {}
_SUMMARY_CACHE_LOCK = threading.Lock()


def _cache_now() -> float:
    return time.monotonic()


def _summary_cache_key(quarter: Optional[str], year: Optional[int]) -> tuple[Optional[str], Optional[int]]:
    return quarter, year


def _get_summary_cache(quarter: Optional[str], year: Optional[int]) -> Optional[Any]:
    key = _summary_cache_key(quarter, year)
    now = _cache_now()
    with _SUMMARY_CACHE_LOCK:
        cached = _SUMMARY_CACHE.get(key)
        if not cached:
            return None
        cached_at, payload = cached
        if now - cached_at > _SUMMARY_CACHE_TTL_SECONDS:
            _SUMMARY_CACHE.pop(key, None)
            return None
        return payload


def _set_summary_cache(quarter: Optional[str], year: Optional[int], payload: Any) -> None:
    with _SUMMARY_CACHE_LOCK:
        _SUMMARY_CACHE[_summary_cache_key(quarter, year)] = (_cache_now(), payload)


def _normalized_goal_type(goal_type: str) -> str:
    """Normalize goal type into dashboard buckets."""
    if goal_type in {"activity", "output", "impact"}:
        return goal_type
    # Legacy/unknown labels (e.g. "operational") are treated as activity.
    return "activity"


def _normalized_strategic_link(link: str) -> str:
    """Normalize strategic link into dashboard buckets."""
    if link in {"strategic", "functional", "operational"}:
        return link

    # Legacy values from older classifiers.
    legacy_map = {
        "high": "strategic",
        "medium": "functional",
        "low": "operational",
    }
    return legacy_map.get(link, "operational")


def _department_stats(
    department: Department,
    goals: list[Goal],
    employees: list[Employee],
    generation_metadata: dict[str, dict],
) -> DepartmentStats:
    status_counts = {status.value: 0 for status in GoalStatus}
    type_counts = {"activity": 0, "output": 0, "impact": 0}
    link_counts = {"strategic": 0, "functional": 0, "operational": 0}
    criteria_totals = {"S": 0.0, "M": 0.0, "A": 0.0, "R": 0.0, "T": 0.0}

    scores = []
    for goal in goals:
        heuristic = evaluate_goal_heuristically(goal.goal_text, goal.metric, goal.deadline, goal.priority)
        details = heuristic["smart_details"]
        scores.append(heuristic["overall_score"])

        status_key = goal.status.value if hasattr(goal.status, "value") else goal.status
        status_counts[status_key] = status_counts.get(status_key, 0) + 1

        metadata = generation_metadata.get(str(goal.goal_id))
        goal_type = _normalized_goal_type(goal_type_for_goal(goal, metadata))
        type_counts[goal_type] += 1
        link = _normalized_strategic_link(strategic_link_for_goal(goal, metadata))
        link_counts[link] += 1

        criteria_totals["S"] += details["specific"]["score"]
        criteria_totals["M"] += details["measurable"]["score"]
        criteria_totals["A"] += details["achievable"]["score"]
        criteria_totals["R"] += details["relevant"]["score"]
        criteria_totals["T"] += details["time_bound"]["score"]

    avg_score = round(sum(scores) / len(scores), 2) if scores else 0.0
    weak_criteria = []
    names = {"S": "Конкретность", "M": "Измеримость", "A": "Достижимость", "R": "Релевантность", "T": "Срок"}
    for key, total in criteria_totals.items():
        if goals and (total / len(goals)) < settings.SMART_THRESHOLD_MEDIUM:
            weak_criteria.append(names[key])

    # 5-factor maturity model
    smart_factor = avg_score
    strategic_factor = (link_counts["strategic"] / len(goals)) if goals else 0
    type_factor = ((type_counts["output"] + type_counts["impact"]) / len(goals)) if goals else 0

    total_weight = sum(float(goal.weight or 0) for goal in goals)
    weight_factor = max(0, 1 - abs(total_weight - 100) / 100) if goals else 0

    employee_goal_counts: dict[int, int] = {}
    for goal in goals:
        employee_goal_counts[goal.employee_id] = employee_goal_counts.get(goal.employee_id, 0) + 1
    valid_count = sum(1 for c in employee_goal_counts.values() if 3 <= c <= 5)
    count_factor = (valid_count / len(employee_goal_counts)) if employee_goal_counts else 0

    maturity = round(
        smart_factor * 0.30
        + strategic_factor * 0.20
        + type_factor * 0.20
        + weight_factor * 0.15
        + count_factor * 0.15,
        2,
    )

    return DepartmentStats(
        department_id=department.id,
        department_name=department.name,
        total_employees=len(employees),
        total_goals=len(goals),
        average_smart_score=avg_score,
        goals_by_status=status_counts,
        goals_by_type=type_counts,
        goals_by_strategic_link=link_counts,
        weak_criteria=weak_criteria[:3],
        maturity_index=maturity,
    )


@router.get("/summary", response_model=DashboardSummary)
async def get_dashboard_summary(
    quarter: Optional[str] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "admin")),
):
    cached_summary = _get_summary_cache(quarter, year)
    if cached_summary is not None:
        return cached_summary

    goals_query = db.query(Goal)
    if quarter:
        goals_query = goals_query.filter(Goal.quarter == quarter)
    if year:
        goals_query = goals_query.filter(Goal.year == year)
    all_goals = goals_query.all()
    generation_metadata = load_generation_metadata(db, [goal.goal_id for goal in all_goals])

    departments = db.query(Department).filter(Department.is_active == True).all()
    department_stats = []
    all_weak_criteria = []
    strategic_count = functional_count = operational_count = 0

    for department in departments:
        employees = db.query(Employee).filter(
            Employee.department_id == department.id,
            Employee.is_active == True,
        ).all()
        employee_ids = {employee.id for employee in employees}
        goals = [goal for goal in all_goals if goal.employee_id in employee_ids]
        if not goals:
            continue

        stats = _department_stats(department, goals, employees, generation_metadata)
        department_stats.append(stats)
        all_weak_criteria.extend(stats.weak_criteria)
        strategic_count += stats.goals_by_strategic_link["strategic"]
        functional_count += stats.goals_by_strategic_link["functional"]
        operational_count += stats.goals_by_strategic_link["operational"]

    total_goals = len(all_goals)
    total_employees = db.query(Employee).filter(Employee.is_active == True).count()
    average_smart_score = round(
        sum(stats.average_smart_score for stats in department_stats) / len(department_stats), 2
    ) if department_stats else 0.0

    total_linked = strategic_count + functional_count + operational_count
    top_issues = sorted(set(all_weak_criteria), key=all_weak_criteria.count, reverse=True)[:5]

    summary = DashboardSummary(
        total_departments=len(departments),
        total_employees=total_employees,
        total_goals=total_goals,
        average_smart_score=average_smart_score,
        strategic_goals_percent=round((strategic_count / total_linked * 100) if total_linked else 0, 1),
        functional_goals_percent=round((functional_count / total_linked * 100) if total_linked else 0, 1),
        operational_goals_percent=round((operational_count / total_linked * 100) if total_linked else 0, 1),
        departments_stats=department_stats,
        top_issues=top_issues,
        quarter=quarter,
        year=year,
    )
    _set_summary_cache(quarter, year, summary)
    return summary


@router.get("/department/{department_id}", response_model=DepartmentStats)
async def get_department_stats(
    department_id: int,
    quarter: Optional[str] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "admin")),
):
    department = db.query(Department).filter(Department.id == department_id).first()
    if not department:
        raise HTTPException(status_code=404, detail="Подразделение не найдено")

    employees = db.query(Employee).filter(
        Employee.department_id == department_id,
        Employee.is_active == True,
    ).all()
    employee_ids = {employee.id for employee in employees}

    goals_query = db.query(Goal).filter(Goal.employee_id.in_(employee_ids))
    if quarter:
        goals_query = goals_query.filter(Goal.quarter == quarter)
    if year:
        goals_query = goals_query.filter(Goal.year == year)
    goals = goals_query.all()
    generation_metadata = load_generation_metadata(db, [goal.goal_id for goal in goals])

    if not goals:
        return DepartmentStats(
            department_id=department_id,
            department_name=department.name,
            total_employees=len(employees),
            total_goals=0,
            average_smart_score=0,
            goals_by_status={},
            goals_by_type={},
            goals_by_strategic_link={},
            weak_criteria=[],
            maturity_index=0,
        )

    return _department_stats(department, goals, employees, generation_metadata)


@router.get("/trends")
async def get_dashboard_trends(
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "admin")),
):
    """
    Тренды качества целеполагания по кварталам.
    Возвращает агрегированные метрики за каждый квартал.
    """
    goals_query = db.query(Goal)
    if year:
        goals_query = goals_query.filter(Goal.year == year)
    all_goals = goals_query.all()

    buckets: dict[tuple, list[Goal]] = {}
    for goal in all_goals:
        q = goal.quarter.value if hasattr(goal.quarter, "value") else goal.quarter
        y = goal.year
        key = (y, q)
        buckets.setdefault(key, []).append(goal)

    generation_metadata = load_generation_metadata(db, [g.goal_id for g in all_goals])

    trends = []
    for (y, q), goals in sorted(buckets.items()):
        scores = []
        strategic_count = 0
        output_impact_count = 0
        for goal in goals:
            h = evaluate_goal_heuristically(goal.goal_text, goal.metric, goal.deadline, goal.priority)
            scores.append(h["overall_score"])
            meta = generation_metadata.get(str(goal.goal_id))
            link = strategic_link_for_goal(goal, meta)
            gtype = goal_type_for_goal(goal, meta)
            if link == "strategic":
                strategic_count += 1
            if gtype in ("output", "impact"):
                output_impact_count += 1

        avg_score = round(sum(scores) / len(scores), 2) if scores else 0
        trends.append({
            "year": y,
            "quarter": q,
            "label": f"{q} {y}",
            "total_goals": len(goals),
            "average_smart_score": avg_score,
            "strategic_percent": round(strategic_count / len(goals) * 100, 1) if goals else 0,
            "output_impact_percent": round(output_impact_count / len(goals) * 100, 1) if goals else 0,
        })

    return {"trends": trends}


@router.get("/employees/{employee_id}/goals-summary")
async def get_employee_goals_summary(
    employee_id: int,
    quarter: Optional[str] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "admin")),
):
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    goals_query = db.query(Goal).filter(Goal.employee_id == employee_id)
    if quarter:
        goals_query = goals_query.filter(Goal.quarter == quarter)
    if year:
        goals_query = goals_query.filter(Goal.year == year)
    goals = goals_query.all()
    generation_metadata = load_generation_metadata(db, [goal.goal_id for goal in goals])

    if not goals:
        return {
            "employee_id": employee_id,
            "employee_name": employee.full_name,
            "total_goals": 0,
            "goals": [],
            "average_score": 0,
            "total_weight": 0,
            "status": "Нет целей",
        }

    scores = [evaluate_goal_heuristically(g.goal_text, g.metric, g.deadline, g.priority)["overall_score"] for g in goals]
    total_weight = sum(float(g.weight or 0) for g in goals)

    return {
        "employee_id": employee_id,
        "employee_name": employee.full_name,
        "position": employee.position.name if employee.position else None,
        "department": employee.department.name if employee.department else None,
        "total_goals": len(goals),
        "average_score": round(sum(scores) / len(scores), 2),
        "total_weight": round(total_weight, 2),
        "weight_valid": abs(total_weight - 100) < 0.1,
        "goals_count_valid": settings.MIN_GOALS_PER_EMPLOYEE <= len(goals) <= settings.MAX_GOALS_PER_EMPLOYEE,
        "goals": [
            {
                "id": str(g.goal_id),
                "title": g.goal_text,
                "weight": float(g.weight or 0),
                "smart_score": evaluate_goal_heuristically(g.goal_text, g.metric, g.deadline, g.priority)["overall_score"],
                "status": g.status.value if hasattr(g.status, "value") else g.status,
                "goal_type": goal_type_for_goal(g, generation_metadata.get(str(g.goal_id))),
                "strategic_link": strategic_link_for_goal(g, generation_metadata.get(str(g.goal_id))),
            }
            for g in goals
        ],
    }
