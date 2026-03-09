"""
Dashboard API endpoints
Аналитика и дашборд качества целеполагания
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, List
from app.database import get_db
from app.models import Goal, Employee, Department, GoalStatus
from app.schemas.generation import DepartmentStats, DashboardSummary
from app.config import settings

router = APIRouter()


@router.get("/summary", response_model=DashboardSummary)
async def get_dashboard_summary(
    quarter: Optional[str] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Получить сводку по качеству целеполагания

    Возвращает агрегированную статистику по всем подразделениям
    """
    # Base query
    goals_query = db.query(Goal)
    if quarter:
        goals_query = goals_query.filter(Goal.quarter == quarter)
    if year:
        goals_query = goals_query.filter(Goal.year == year)

    all_goals = goals_query.all()

    # Get departments
    departments = db.query(Department).filter(Department.is_active == True).all()

    # Calculate department stats
    departments_stats = []
    total_smart_score = 0
    strategic_count = 0
    functional_count = 0
    operational_count = 0
    all_weak_criteria = []

    for dept in departments:
        # Get employees in department
        employees = db.query(Employee).filter(
            Employee.department_id == dept.id,
            Employee.is_active == True
        ).all()
        employee_ids = [e.id for e in employees]

        # Get goals for department
        dept_goals = [g for g in all_goals if g.employee_id in employee_ids]

        if not dept_goals:
            continue

        # Calculate stats
        avg_score = sum(g.smart_score or 0 for g in dept_goals) / len(dept_goals)
        total_smart_score += avg_score

        # Count by status
        status_counts = {}
        for status in GoalStatus:
            status_counts[status.value] = len([g for g in dept_goals if g.status == status])

        # Count by type
        type_counts = {
            "activity": len([g for g in dept_goals if g.goal_type and g.goal_type.value == "activity"]),
            "output": len([g for g in dept_goals if g.goal_type and g.goal_type.value == "output"]),
            "impact": len([g for g in dept_goals if g.goal_type and g.goal_type.value == "impact"])
        }

        # Count by strategic link
        link_counts = {
            "strategic": 0,
            "functional": 0,
            "operational": 0
        }
        for g in dept_goals:
            if g.strategic_link:
                link_key = g.strategic_link.value if hasattr(g.strategic_link, 'value') else g.strategic_link
                if link_key in link_counts:
                    link_counts[link_key] += 1
                    if link_key == "strategic":
                        strategic_count += 1
                    elif link_key == "functional":
                        functional_count += 1
                    else:
                        operational_count += 1

        # Find weak criteria
        weak_criteria = []
        criteria_scores = {"S": 0, "M": 0, "A": 0, "R": 0, "T": 0}
        criteria_counts = {"S": 0, "M": 0, "A": 0, "R": 0, "T": 0}

        for g in dept_goals:
            if g.smart_details:
                details = g.smart_details
                if "specific" in details:
                    criteria_scores["S"] += details["specific"].get("score", 0)
                    criteria_counts["S"] += 1
                if "measurable" in details:
                    criteria_scores["M"] += details["measurable"].get("score", 0)
                    criteria_counts["M"] += 1
                if "achievable" in details:
                    criteria_scores["A"] += details["achievable"].get("score", 0)
                    criteria_counts["A"] += 1
                if "relevant" in details:
                    criteria_scores["R"] += details["relevant"].get("score", 0)
                    criteria_counts["R"] += 1
                if "time_bound" in details:
                    criteria_scores["T"] += details["time_bound"].get("score", 0)
                    criteria_counts["T"] += 1

        criteria_names = {
            "S": "Конкретность",
            "M": "Измеримость",
            "A": "Достижимость",
            "R": "Релевантность",
            "T": "Срок"
        }

        for c in ["S", "M", "A", "R", "T"]:
            if criteria_counts[c] > 0:
                avg = criteria_scores[c] / criteria_counts[c]
                if avg < settings.SMART_THRESHOLD_MEDIUM:
                    weak_criteria.append(criteria_names[c])
                    all_weak_criteria.append(criteria_names[c])

        # Calculate maturity index
        maturity = calculate_maturity_index(dept_goals, avg_score, link_counts)

        departments_stats.append(DepartmentStats(
            department_id=dept.id,
            department_name=dept.name,
            total_employees=len(employees),
            total_goals=len(dept_goals),
            average_smart_score=round(avg_score, 2),
            goals_by_status=status_counts,
            goals_by_type=type_counts,
            goals_by_strategic_link=link_counts,
            weak_criteria=weak_criteria[:3],
            maturity_index=maturity
        ))

    # Calculate totals
    total_goals = len(all_goals)
    total_employees = db.query(Employee).filter(Employee.is_active == True).count()
    avg_smart_score = total_smart_score / len(departments_stats) if departments_stats else 0

    # Strategic link percentages
    total_with_links = strategic_count + functional_count + operational_count
    strategic_percent = (strategic_count / total_with_links * 100) if total_with_links > 0 else 0
    functional_percent = (functional_count / total_with_links * 100) if total_with_links > 0 else 0
    operational_percent = (operational_count / total_with_links * 100) if total_with_links > 0 else 0

    # Top issues across all departments
    issue_counts = {}
    for issue in all_weak_criteria:
        issue_counts[issue] = issue_counts.get(issue, 0) + 1
    top_issues = sorted(issue_counts.keys(), key=lambda x: issue_counts[x], reverse=True)[:5]

    return DashboardSummary(
        total_departments=len(departments),
        total_employees=total_employees,
        total_goals=total_goals,
        average_smart_score=round(avg_smart_score, 2),
        strategic_goals_percent=round(strategic_percent, 1),
        functional_goals_percent=round(functional_percent, 1),
        operational_goals_percent=round(operational_percent, 1),
        departments_stats=departments_stats,
        top_issues=top_issues,
        quarter=quarter,
        year=year
    )


@router.get("/department/{department_id}", response_model=DepartmentStats)
async def get_department_stats(
    department_id: int,
    quarter: Optional[str] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Получить статистику по конкретному подразделению
    """
    department = db.query(Department).filter(Department.id == department_id).first()
    if not department:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Подразделение не найдено")

    # Get employees
    employees = db.query(Employee).filter(
        Employee.department_id == department_id,
        Employee.is_active == True
    ).all()
    employee_ids = [e.id for e in employees]

    # Get goals
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
            maturity_index=0
        )

    # Calculate stats (same logic as summary)
    avg_score = sum(g.smart_score or 0 for g in goals) / len(goals)

    status_counts = {}
    for status in GoalStatus:
        status_counts[status.value] = len([g for g in goals if g.status == status])

    type_counts = {
        "activity": len([g for g in goals if g.goal_type and g.goal_type.value == "activity"]),
        "output": len([g for g in goals if g.goal_type and g.goal_type.value == "output"]),
        "impact": len([g for g in goals if g.goal_type and g.goal_type.value == "impact"])
    }

    link_counts = {"strategic": 0, "functional": 0, "operational": 0}
    for g in goals:
        if g.strategic_link:
            link_key = g.strategic_link.value if hasattr(g.strategic_link, 'value') else g.strategic_link
            if link_key in link_counts:
                link_counts[link_key] += 1

    maturity = calculate_maturity_index(goals, avg_score, link_counts)

    return DepartmentStats(
        department_id=department_id,
        department_name=department.name,
        total_employees=len(employees),
        total_goals=len(goals),
        average_smart_score=round(avg_score, 2),
        goals_by_status=status_counts,
        goals_by_type=type_counts,
        goals_by_strategic_link=link_counts,
        weak_criteria=[],
        maturity_index=maturity
    )


@router.get("/employees/{employee_id}/goals-summary")
async def get_employee_goals_summary(
    employee_id: int,
    quarter: Optional[str] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Получить сводку по целям сотрудника
    """
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        from fastapi import HTTPException
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
            "status": "Нет целей"
        }

    total_weight = sum(g.weight or 0 for g in goals)
    avg_score = sum(g.smart_score or 0 for g in goals) / len(goals)

    return {
        "employee_id": employee_id,
        "employee_name": employee.full_name,
        "position": employee.position.name if employee.position else None,
        "department": employee.department.name if employee.department else None,
        "total_goals": len(goals),
        "average_score": round(avg_score, 2),
        "total_weight": total_weight,
        "weight_valid": abs(total_weight - 100) < 0.1,
        "goals_count_valid": settings.MIN_GOALS_PER_EMPLOYEE <= len(goals) <= settings.MAX_GOALS_PER_EMPLOYEE,
        "goals": [
            {
                "id": g.id,
                "title": g.title,
                "weight": g.weight,
                "smart_score": g.smart_score,
                "status": g.status.value if g.status else None,
                "goal_type": g.goal_type.value if g.goal_type else None,
                "strategic_link": g.strategic_link.value if g.strategic_link else None
            }
            for g in goals
        ]
    }


def calculate_maturity_index(goals: List[Goal], avg_smart_score: float, link_counts: dict) -> float:
    """
    Calculate goal-setting maturity index for a department

    Based on:
    - Average SMART score (40%)
    - Strategic goals percentage (30%)
    - Output/impact goals percentage (30%)
    """
    if not goals:
        return 0.0

    # SMART score component (40%)
    smart_component = avg_smart_score * 0.4

    # Strategic link component (30%)
    total_with_links = sum(link_counts.values())
    strategic_ratio = link_counts.get("strategic", 0) / total_with_links if total_with_links > 0 else 0
    strategic_component = strategic_ratio * 0.3

    # Goal type component (30%) - prefer output and impact over activity
    output_impact_count = len([g for g in goals if g.goal_type and g.goal_type.value in ["output", "impact"]])
    type_ratio = output_impact_count / len(goals)
    type_component = type_ratio * 0.3

    maturity = smart_component + strategic_component + type_component
    return round(maturity, 2)
