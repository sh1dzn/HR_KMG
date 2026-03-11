"""
Dashboard API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models import Goal, Employee, Department, GoalStatus
from app.schemas.generation import DepartmentStats, DashboardSummary
from app.config import settings
from app.utils.smart_heuristics import evaluate_goal_heuristically

router = APIRouter()


def _goal_type(goal: Goal) -> str:
    if goal.project_id:
        return "impact"
    if goal.system_id:
        return "output"
    return "activity"


def _strategic_link(goal: Goal) -> str:
    if goal.project_id:
        return "strategic"
    if goal.system_id:
        return "functional"
    return "operational"


def _department_stats(department: Department, goals: list[Goal], employees: list[Employee]) -> DepartmentStats:
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

        type_counts[_goal_type(goal)] += 1
        link_counts[_strategic_link(goal)] += 1

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

    maturity = round(
        avg_score * 0.5
        + (link_counts["strategic"] / len(goals) if goals else 0) * 0.25
        + ((type_counts["output"] + type_counts["impact"]) / len(goals) if goals else 0) * 0.25,
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
    db: Session = Depends(get_db)
):
    goals_query = db.query(Goal)
    if quarter:
        goals_query = goals_query.filter(Goal.quarter == quarter)
    if year:
        goals_query = goals_query.filter(Goal.year == year)
    all_goals = goals_query.all()

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

        stats = _department_stats(department, goals, employees)
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

    return DashboardSummary(
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


@router.get("/department/{department_id}", response_model=DepartmentStats)
async def get_department_stats(
    department_id: int,
    quarter: Optional[str] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db)
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

    return _department_stats(department, goals, employees)


@router.get("/employees/{employee_id}/goals-summary")
async def get_employee_goals_summary(
    employee_id: int,
    quarter: Optional[str] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db)
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
                "goal_type": _goal_type(g),
                "strategic_link": _strategic_link(g),
            }
            for g in goals
        ],
    }
