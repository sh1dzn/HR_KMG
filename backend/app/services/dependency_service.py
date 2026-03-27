"""
Dependency service — graph queries, CRUD, AI suggestions.
"""
import logging
from collections import Counter
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from app.models import Goal, Employee
from app.models.dependency import GoalDependency, DependencyType, DependencyStatus, DependencyCreatedBy
from app.services.prediction_service import compute_risk_score

logger = logging.getLogger("hr_ai.deps")


def get_dependency_graph(
    db: Session,
    quarter: Optional[str] = None,
    year: Optional[int] = None,
    department_id: Optional[int] = None,
) -> dict:
    """Build dependency graph data for visualization."""
    # Load goals
    goals_query = db.query(Goal).options(joinedload(Goal.employee).joinedload(Employee.department))
    if quarter:
        goals_query = goals_query.filter(Goal.quarter == quarter)
    if year:
        goals_query = goals_query.filter(Goal.year == year)
    if department_id:
        goals_query = goals_query.join(Employee).filter(Employee.department_id == department_id)
    goals = goals_query.all()
    goal_ids = {str(g.goal_id) for g in goals}
    goal_map = {str(g.goal_id): g for g in goals}

    # Load dependencies
    deps = db.query(GoalDependency).filter(
        GoalDependency.status == DependencyStatus.ACTIVE,
        GoalDependency.source_goal_id.in_(goal_ids) | GoalDependency.target_goal_id.in_(goal_ids),
    ).all()

    # Count dependencies per goal
    dep_count = Counter()
    blocker_count = Counter()
    for d in deps:
        dep_count[str(d.source_goal_id)] += 1
        dep_count[str(d.target_goal_id)] += 1
        if d.dependency_type == DependencyType.BLOCKS:
            blocker_count[str(d.target_goal_id)] += 1

    # Build nodes
    nodes = []
    for g in goals:
        gid = str(g.goal_id)
        emp = g.employee
        risk = compute_risk_score(g, db) if dep_count[gid] > 0 else {"risk_score": 0}
        nodes.append({
            "id": gid,
            "text": g.goal_text[:100],
            "status": g.status.value if hasattr(g.status, "value") else g.status,
            "department": emp.department.name if emp and emp.department else None,
            "employee_name": emp.full_name if emp else None,
            "risk_score": risk["risk_score"],
            "is_blocker": blocker_count[gid] > 0,
            "dependency_count": dep_count[gid],
        })

    # Build edges
    edges = []
    for d in deps:
        edges.append({
            "id": str(d.id),
            "source": str(d.source_goal_id),
            "target": str(d.target_goal_id),
            "type": d.dependency_type.value if hasattr(d.dependency_type, "value") else d.dependency_type,
            "status": d.status.value if hasattr(d.status, "value") else d.status,
        })

    # Blockers
    blockers = []
    for gid, count in blocker_count.most_common(10):
        g = goal_map.get(gid)
        if g:
            emp = g.employee
            blockers.append({
                "goal_id": gid,
                "goal_text": g.goal_text[:100],
                "blocked_count": count,
                "status": g.status.value if hasattr(g.status, "value") else g.status,
                "department": emp.department.name if emp and emp.department else None,
            })

    return {"nodes": nodes, "edges": edges, "blockers": blockers}


def create_dependency(
    db: Session,
    source_goal_id: str,
    target_goal_id: str,
    dep_type: str,
    created_by: str = "manual",
) -> GoalDependency:
    dep = GoalDependency(
        source_goal_id=source_goal_id,
        target_goal_id=target_goal_id,
        dependency_type=dep_type,
        status=DependencyStatus.ACTIVE,
        created_by=created_by,
    )
    db.add(dep)
    db.commit()
    db.refresh(dep)
    return dep


async def suggest_dependencies(db: Session, goal: Goal, quarter: str, year: int) -> list[dict]:
    """Use LLM to suggest dependencies for a goal."""
    other_goals = db.query(Goal).options(
        joinedload(Goal.employee).joinedload(Employee.department)
    ).filter(
        Goal.quarter == quarter,
        Goal.year == year,
        Goal.goal_id != goal.goal_id,
    ).limit(50).all()

    if not other_goals:
        return []

    try:
        from app.services.llm_service import llm_service

        goals_text = "\n".join(
            f"- [{str(g.goal_id)[:8]}] ({g.employee.department.name if g.employee and g.employee.department else '?'}) {g.goal_text[:120]}"
            for g in other_goals
        )
        prompt = (
            f"Цель: \"{goal.goal_text}\"\n\n"
            f"Другие цели в квартале:\n{goals_text}\n\n"
            f"Какие цели могут блокировать или быть связаны с данной целью? "
            f"Верни JSON-массив: [{{\"target_id_prefix\": \"...\", \"type\": \"blocks|relates_to\", "
            f"\"confidence\": 0.0-1.0, \"reason\": \"...\"}}]. "
            f"Верни только связи с confidence > 0.6. Если нет — верни []."
        )
        result = await llm_service.complete_json(prompt, system_prompt="Ты HR-аналитик. Ищи зависимости между целями.")

        suggestions = []
        if isinstance(result, list):
            for item in result:
                prefix = item.get("target_id_prefix", "")
                matched_goal = next((g for g in other_goals if str(g.goal_id).startswith(prefix)), None)
                if matched_goal:
                    emp = matched_goal.employee
                    suggestions.append({
                        "target_goal_id": str(matched_goal.goal_id),
                        "target_text": matched_goal.goal_text[:120],
                        "target_department": emp.department.name if emp and emp.department else None,
                        "type": item.get("type", "relates_to"),
                        "confidence": item.get("confidence", 0.5),
                        "reason": item.get("reason", ""),
                    })
        return suggestions
    except Exception:
        return []
