"""
Platform MCP service for chat assistant.
Provides lightweight, role-aware access to live platform data.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional, Any

from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import Session

from app.models import Department, Employee, Goal, GoalStatus
from app.models.user import User


@dataclass
class Scope:
    employee_ids: Optional[list[int]] = None


def _status_value(status: object) -> str:
    return status.value if hasattr(status, "value") else str(status)


def _extract_period(query: str) -> tuple[Optional[str], Optional[int]]:
    quarter = None
    year = None

    q_match = re.search(r"\bq([1-4])\b", query, re.IGNORECASE)
    if q_match:
        quarter = f"Q{q_match.group(1)}"

    y_match = re.search(r"\b(20\d{2})\b", query)
    if y_match:
        year = int(y_match.group(1))

    return quarter, year


def _resolve_scope(user: User, db: Session) -> Scope:
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    emp = user.employee
    if role == "admin":
        return Scope(employee_ids=None)

    if not emp:
        return Scope(employee_ids=[])

    if role == "manager":
        subordinates = db.query(Employee.id).filter(Employee.manager_id == emp.id).all()
        subordinate_ids = [row[0] for row in subordinates]
        # Include manager's own goals as well.
        return Scope(employee_ids=[emp.id, *subordinate_ids])

    return Scope(employee_ids=[emp.id])


def _apply_goal_filters(query, *, scope: Scope, quarter: Optional[str], year: Optional[int]):
    if scope.employee_ids is not None:
        if not scope.employee_ids:
            return query.filter(False)
        query = query.filter(Goal.employee_id.in_(scope.employee_ids))
    if quarter:
        query = query.filter(Goal.quarter == quarter)
    if year:
        query = query.filter(Goal.year == year)
    return query


def _normalize_period(query: str, quarter: Optional[str], year: Optional[int]) -> tuple[Optional[str], Optional[int]]:
    if quarter is not None or year is not None:
        return quarter, year
    return _extract_period(query)


def _resolve_user_scope(user: User, db: Session, query: str, quarter: Optional[str], year: Optional[int]):
    resolved_quarter, resolved_year = _normalize_period(query, quarter, year)
    scope = _resolve_scope(user, db)
    return scope, resolved_quarter, resolved_year


def _org_summary_data(db: Session, *, scope: Scope, quarter: Optional[str], year: Optional[int]) -> dict[str, Any]:
    goals_query = db.query(Goal)
    goals_query = _apply_goal_filters(goals_query, scope=scope, quarter=quarter, year=year)
    goals = goals_query.all()

    if scope.employee_ids is None:
        total_employees = db.query(Employee).filter(Employee.is_active == True).count()
        total_departments = db.query(Department).filter(Department.is_active == True).count()
    else:
        employee_q = db.query(Employee).filter(Employee.id.in_(scope.employee_ids), Employee.is_active == True)
        total_employees = employee_q.count()
        department_ids = {
            row[0]
            for row in db.query(Employee.department_id).filter(Employee.id.in_(scope.employee_ids)).all()
            if row[0] is not None
        }
        total_departments = len(department_ids)

    status_counts: dict[str, int] = {}
    for goal in goals:
        status = _status_value(goal.status)
        status_counts[status] = status_counts.get(status, 0) + 1

    return {
        "period": {"quarter": quarter, "year": year},
        "employees": int(total_employees),
        "departments": int(total_departments),
        "goals": len(goals),
        "goals_by_status": dict(sorted(status_counts.items())),
    }


def _org_summary(db: Session, *, scope: Scope, quarter: Optional[str], year: Optional[int]) -> str:
    summary = _org_summary_data(db, scope=scope, quarter=quarter, year=year)
    period = f"{summary['period']['quarter'] or 'ALL'} {summary['period']['year'] or 'ALL'}"
    status_counts = summary.get("goals_by_status", {})
    status_repr = ", ".join(f"{k}:{v}" for k, v in status_counts.items()) if status_counts else "нет целей"
    return (
        f"### MCP Summary ({period})\n"
        f"- employees={summary['employees']}\n"
        f"- departments={summary['departments']}\n"
        f"- goals={summary['goals']}\n"
        f"- goals_by_status={status_repr}"
    )


def _problem_departments_data(
    db: Session,
    *,
    scope: Scope,
    quarter: Optional[str],
    year: Optional[int],
    limit: int = 5,
) -> dict[str, Any]:
    conditions = []
    if scope.employee_ids is not None:
        if not scope.employee_ids:
            return {"items": [], "access_denied": True}
        conditions.append(Goal.employee_id.in_(scope.employee_ids))
    if quarter:
        conditions.append(Goal.quarter == quarter)
    if year:
        conditions.append(Goal.year == year)

    metric_empty = case((or_(Goal.metric.is_(None), func.btrim(Goal.metric) == ""), 1), else_=0)
    deadline_empty = case((Goal.deadline.is_(None), 1), else_=0)
    overdue_flag = case((Goal.status == GoalStatus.OVERDUE, 1), else_=0)
    draft_flag = case((Goal.status == GoalStatus.DRAFT, 1), else_=0)

    rows = (
        db.query(
            Department.name.label("department_name"),
            func.count(Goal.goal_id).label("total_goals"),
            func.sum(metric_empty).label("missing_metric"),
            func.sum(deadline_empty).label("missing_deadline"),
            func.sum(overdue_flag).label("overdue_goals"),
            func.sum(draft_flag).label("draft_goals"),
        )
        .join(Goal, Goal.department_id == Department.id)
        .filter(and_(*conditions) if conditions else True)
        .group_by(Department.id, Department.name)
        .having(func.count(Goal.goal_id) > 0)
        .all()
    )

    scored: list[dict[str, Any]] = []
    for row in rows:
        total = int(row.total_goals or 0)
        if total <= 0:
            continue
        missing_metric = int(row.missing_metric or 0)
        missing_deadline = int(row.missing_deadline or 0)
        overdue_goals = int(row.overdue_goals or 0)
        draft_goals = int(row.draft_goals or 0)

        score = (
            (missing_metric / total) * 0.4
            + (missing_deadline / total) * 0.3
            + (overdue_goals / total) * 0.2
            + (draft_goals / total) * 0.1
        )
        scored.append(
            {
                "department_name": row.department_name,
                "issue_score": round(score, 4),
                "goals": total,
                "missing_metric": missing_metric,
                "missing_deadline": missing_deadline,
                "overdue": overdue_goals,
                "draft": draft_goals,
            }
        )

    scored.sort(key=lambda item: item["issue_score"], reverse=True)
    return {
        "items": scored[: max(1, min(limit, 20))],
        "access_denied": False,
        "period": {"quarter": quarter, "year": year},
    }


def _problem_departments(db: Session, *, scope: Scope, quarter: Optional[str], year: Optional[int], limit: int = 5) -> str:
    data = _problem_departments_data(db, scope=scope, quarter=quarter, year=year, limit=limit)
    if data.get("access_denied"):
        return "### MCP Problem Departments\n- нет доступа к данным подразделений"
    items = data.get("items", [])
    if not items:
        return "### MCP Problem Departments\n- данных не найдено"

    lines = ["### MCP Problem Departments (top by issue_score)"]
    for index, item in enumerate(items, start=1):
        lines.append(
            f"{index}. {item['department_name']}: issue_score={item['issue_score']:.2f}, "
            f"goals={item['goals']}, missing_metric={item['missing_metric']}, "
            f"missing_deadline={item['missing_deadline']}, overdue={item['overdue']}"
        )
    return "\n".join(lines)


def _top_employees_data(
    db: Session,
    *,
    scope: Scope,
    quarter: Optional[str],
    year: Optional[int],
    limit: int = 5,
) -> dict[str, Any]:
    conditions = []
    if scope.employee_ids is not None:
        if not scope.employee_ids:
            return {"items": [], "access_denied": True}
        conditions.append(Goal.employee_id.in_(scope.employee_ids))
    if quarter:
        conditions.append(Goal.quarter == quarter)
    if year:
        conditions.append(Goal.year == year)

    done_flag = case((Goal.status == GoalStatus.DONE, 1), else_=0)
    approved_flag = case((Goal.status == GoalStatus.APPROVED, 1), else_=0)
    overdue_flag = case((Goal.status == GoalStatus.OVERDUE, 1), else_=0)

    rows = (
        db.query(
            Employee.id.label("employee_id"),
            Employee.full_name.label("full_name"),
            func.count(Goal.goal_id).label("total_goals"),
            func.sum(done_flag).label("done_goals"),
            func.sum(approved_flag).label("approved_goals"),
            func.sum(overdue_flag).label("overdue_goals"),
        )
        .join(Goal, Goal.employee_id == Employee.id)
        .filter(and_(*conditions) if conditions else True)
        .group_by(Employee.id, Employee.full_name)
        .having(func.count(Goal.goal_id) >= 3)
        .all()
    )

    ranking: list[dict[str, Any]] = []
    for row in rows:
        total = int(row.total_goals or 0)
        if total <= 0:
            continue
        done = int(row.done_goals or 0)
        approved = int(row.approved_goals or 0)
        overdue = int(row.overdue_goals or 0)

        completion_rate = (done + approved) / total if total else 0.0
        overdue_rate = overdue / total if total else 0.0
        score = completion_rate - overdue_rate * 0.5
        ranking.append(
            {
                "employee_id": int(row.employee_id),
                "full_name": row.full_name,
                "score": round(score, 4),
                "goals": total,
                "completion_rate": round(completion_rate, 4),
                "overdue_rate": round(overdue_rate, 4),
            }
        )

    ranking.sort(key=lambda item: item["score"], reverse=True)
    return {
        "items": ranking[: max(1, min(limit, 20))],
        "access_denied": False,
        "period": {"quarter": quarter, "year": year},
    }


def _top_employees(db: Session, *, scope: Scope, quarter: Optional[str], year: Optional[int], limit: int = 5) -> str:
    data = _top_employees_data(db, scope=scope, quarter=quarter, year=year, limit=limit)
    if data.get("access_denied"):
        return "### MCP Top Employees\n- нет доступных сотрудников"
    items = data.get("items", [])
    if not items:
        return "### MCP Top Employees\n- нет сотрудников с минимум 3 целями за период"

    lines = ["### MCP Top Employees (completion-focused)"]
    for index, item in enumerate(items, start=1):
        lines.append(
            f"{index}. {item['full_name']}: score={item['score']:.2f}, goals={item['goals']}, "
            f"completion={item['completion_rate'] * 100:.1f}%, overdue={item['overdue_rate'] * 100:.1f}%"
        )
    return "\n".join(lines)


def _detect_intents(query: str) -> set[str]:
    q = query.lower()
    intents: set[str] = set()
    if any(word in q for word in ("подраздел", "отдел", "департамент")) and any(
        word in q for word in ("проблем", "слаб", "качество", "риск")
    ):
        intents.add("problem_departments")
    if any(word in q for word in ("лучший", "топ", "сильн", "кто лучше", "кто лучший")):
        intents.add("top_employees")
    if any(word in q for word in ("статус", "распределение", "сколько целей", "сводка")):
        intents.add("summary")
    return intents


def build_mcp_context(user: User, db: Session, query: str) -> str:
    """
    Build role-aware platform context for chat.
    This acts as an internal MCP layer for live service data.
    """
    quarter, year = _extract_period(query)
    scope = _resolve_scope(user, db)
    intents = _detect_intents(query)

    blocks = [_org_summary(db, scope=scope, quarter=quarter, year=year)]

    if "problem_departments" in intents:
        blocks.append(_problem_departments(db, scope=scope, quarter=quarter, year=year))

    if "top_employees" in intents:
        blocks.append(_top_employees(db, scope=scope, quarter=quarter, year=year))

    return "\n\n".join(blocks)


def find_user_for_mcp(
    db: Session,
    *,
    user_email: Optional[str] = None,
    user_id: Optional[str] = None,
    employee_id: Optional[int] = None,
) -> Optional[User]:
    query = db.query(User).filter(User.is_active == True)
    if user_id:
        return query.filter(User.id == user_id).first()
    if employee_id is not None:
        return query.filter(User.employee_id == employee_id).first()
    if user_email:
        return query.filter(func.lower(User.email) == user_email.strip().lower()).first()
    return None


def get_org_summary_data(
    user: User,
    db: Session,
    *,
    query: str = "",
    quarter: Optional[str] = None,
    year: Optional[int] = None,
) -> dict[str, Any]:
    scope, resolved_quarter, resolved_year = _resolve_user_scope(user, db, query, quarter, year)
    return _org_summary_data(db, scope=scope, quarter=resolved_quarter, year=resolved_year)


def get_problem_departments_data(
    user: User,
    db: Session,
    *,
    query: str = "",
    quarter: Optional[str] = None,
    year: Optional[int] = None,
    limit: int = 5,
) -> dict[str, Any]:
    scope, resolved_quarter, resolved_year = _resolve_user_scope(user, db, query, quarter, year)
    return _problem_departments_data(
        db,
        scope=scope,
        quarter=resolved_quarter,
        year=resolved_year,
        limit=max(1, min(limit, 20)),
    )


def get_top_employees_data(
    user: User,
    db: Session,
    *,
    query: str = "",
    quarter: Optional[str] = None,
    year: Optional[int] = None,
    limit: int = 5,
) -> dict[str, Any]:
    scope, resolved_quarter, resolved_year = _resolve_user_scope(user, db, query, quarter, year)
    return _top_employees_data(
        db,
        scope=scope,
        quarter=resolved_quarter,
        year=resolved_year,
        limit=max(1, min(limit, 20)),
    )


def get_employee_goals_data(
    user: User,
    db: Session,
    *,
    employee_id: Optional[int] = None,
    query: str = "",
    quarter: Optional[str] = None,
    year: Optional[int] = None,
    limit: int = 20,
) -> dict[str, Any]:
    scope, resolved_quarter, resolved_year = _resolve_user_scope(user, db, query, quarter, year)
    if employee_id is None:
        employee_id = user.employee.id if user.employee else None

    if employee_id is None:
        return {
            "access_denied": True,
            "error": "employee_id is required for this user",
            "items": [],
        }

    if scope.employee_ids is not None and employee_id not in scope.employee_ids:
        return {
            "access_denied": True,
            "error": "not enough permissions for this employee_id",
            "employee_id": employee_id,
            "items": [],
        }

    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        return {
            "access_denied": False,
            "employee_id": employee_id,
            "items": [],
            "error": "employee not found",
        }

    goals_query = db.query(Goal).filter(Goal.employee_id == employee_id)
    if resolved_quarter:
        goals_query = goals_query.filter(Goal.quarter == resolved_quarter)
    if resolved_year:
        goals_query = goals_query.filter(Goal.year == resolved_year)
    goals = goals_query.order_by(Goal.created_at.desc()).limit(max(1, min(limit, 100))).all()

    items = []
    for goal in goals:
        items.append(
            {
                "goal_id": str(goal.goal_id),
                "goal_text": goal.goal_text,
                "status": _status_value(goal.status),
                "metric": goal.metric,
                "deadline": goal.deadline.isoformat() if goal.deadline else None,
                "quarter": _status_value(goal.quarter),
                "year": int(goal.year),
                "weight": float(goal.weight) if goal.weight is not None else None,
            }
        )

    return {
        "access_denied": False,
        "period": {"quarter": resolved_quarter, "year": resolved_year},
        "employee": {
            "id": int(employee.id),
            "full_name": employee.full_name,
            "department_name": employee.department.name if employee.department else None,
            "position_name": employee.position.name if employee.position else None,
        },
        "items": items,
    }
