"""
Cascade service — generate cascaded goals + detect conflicts using LLM.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from sqlalchemy.orm import Session

from app.models import Goal, GoalStatus, GoalEvent, GoalEventType, Employee, Department

logger = logging.getLogger("hr_ai.cascade")


async def generate_cascade_preview(
    source_goal: Goal,
    target_department_ids: list[int],
    goals_per_dept: int,
    db: Session,
) -> dict:
    """Generate cascade preview with LLM + conflict detection."""
    departments = db.query(Department).filter(Department.id.in_(target_department_ids)).all()
    dept_map = {d.id: d for d in departments}

    # Gather existing goals per department for conflict detection
    existing_by_dept: dict[int, list[str]] = {}
    for dept_id in target_department_ids:
        existing = db.query(Goal).join(Employee).filter(
            Employee.department_id == dept_id,
            Goal.quarter == source_goal.quarter,
            Goal.year == source_goal.year,
        ).limit(20).all()
        existing_by_dept[dept_id] = [g.goal_text for g in existing]

    cascaded_goals = []
    all_generated_texts = []

    try:
        from app.services.llm_service import llm_service

        for dept_id in target_department_ids:
            dept = dept_map.get(dept_id)
            if not dept:
                continue
            existing_texts = existing_by_dept.get(dept_id, [])
            existing_context = "\n".join(f"  - {t}" for t in existing_texts[:5]) if existing_texts else "  (нет целей)"

            prompt = (
                f"Стратегическая цель руководителя: \"{source_goal.goal_text}\"\n\n"
                f"Отдел: {dept.name}\n"
                f"Существующие цели отдела:\n{existing_context}\n\n"
                f"Сгенерируй {goals_per_dept} каскадных целей для этого отдела. "
                f"Каждая цель должна быть SMART, связана со стратегической целью, и не дублировать существующие.\n"
                f"Верни JSON-массив: [{{\"text\": \"...\", \"suggested_weight\": 25, \"rationale\": \"...\"}}]"
            )
            result = await llm_service.complete_json(prompt, system_prompt="Ты HR-эксперт по целеполаганию.")
            dept_goals = []
            if isinstance(result, list):
                for item in result[:goals_per_dept]:
                    dept_goals.append({
                        "text": item.get("text", ""),
                        "suggested_weight": item.get("suggested_weight", round(100 / goals_per_dept)),
                        "rationale": item.get("rationale", ""),
                    })
                    all_generated_texts.append({"text": item.get("text", ""), "department": dept.name})
            cascaded_goals.append({
                "department_id": dept_id,
                "department_name": dept.name,
                "goals": dept_goals,
            })

        # Conflict detection
        conflicts = await detect_conflicts(all_generated_texts, existing_by_dept, dept_map)

    except Exception as e:
        logger.warning("Cascade LLM failed: %s, returning empty preview", e)
        for dept_id in target_department_ids:
            dept = dept_map.get(dept_id)
            if dept:
                cascaded_goals.append({"department_id": dept_id, "department_name": dept.name, "goals": []})
        conflicts = []

    return {
        "source_goal": {"id": str(source_goal.goal_id), "text": source_goal.goal_text},
        "cascaded_goals": cascaded_goals,
        "conflicts": conflicts,
        "conflict_count": len(conflicts),
    }


async def detect_conflicts(generated: list[dict], existing_by_dept: dict, dept_map: dict) -> list[dict]:
    """Use LLM to detect conflicts between generated and existing goals."""
    try:
        from app.services.llm_service import llm_service

        all_goals_text = "Сгенерированные цели:\n"
        for g in generated:
            all_goals_text += f"  - [{g['department']}] {g['text']}\n"
        all_goals_text += "\nСуществующие цели:\n"
        for dept_id, texts in existing_by_dept.items():
            dept_name = dept_map[dept_id].name if dept_id in dept_map else str(dept_id)
            for t in texts[:5]:
                all_goals_text += f"  - [{dept_name}] {t}\n"

        prompt = (
            f"{all_goals_text}\n"
            f"Найди конфликты между целями (противоречия, дубликаты, конкуренция за ресурсы). "
            f"Верни JSON-массив: [{{\"type\": \"contradiction|duplicate|resource\", "
            f"\"goal_a\": {{\"text\": \"...\", \"department\": \"...\"}}, "
            f"\"goal_b\": {{\"text\": \"...\", \"department\": \"...\"}}, "
            f"\"explanation\": \"...\"}}]. "
            f"Если конфликтов нет — верни пустой массив []."
        )
        result = await llm_service.complete_json(prompt, system_prompt="Ты HR-аналитик. Ищи конфликты между целями.")
        if isinstance(result, list):
            return result
    except Exception:
        pass
    return []


def confirm_cascade(
    source_goal_id: str,
    goals_data: list[dict],
    db: Session,
) -> list[str]:
    """Create cascaded goals in DB."""
    now = datetime.now(timezone.utc)
    created_ids = []

    for g in goals_data:
        employee_id = g.get("employee_id")
        department_id = g.get("department_id")
        goal_text = (g.get("text") or "").strip()

        if not employee_id:
            raise ValueError(f"Для подразделения {department_id} не выбран сотрудник")
        if not goal_text:
            raise ValueError("Текст каскадной цели не может быть пустым")

        employee = db.query(Employee).filter(Employee.id == employee_id).first()
        if not employee:
            raise ValueError(f"Сотрудник с id={employee_id} не найден")
        if not employee.is_active:
            raise ValueError(f"Сотрудник с id={employee_id} неактивен")
        if employee.department_id != department_id:
            raise ValueError(
                f"Сотрудник {employee.full_name} не относится к подразделению {department_id}"
            )

        goal = Goal(
            goal_id=str(uuid4()),
            employee_id=employee_id,
            department_id=department_id,
            employee_name_snapshot=employee.full_name,
            position_snapshot=employee.position.name if employee.position else None,
            department_name_snapshot=employee.department.name if employee.department else None,
            goal_text=goal_text,
            weight=g["weight"],
            quarter=g["quarter"],
            year=g["year"],
            status=GoalStatus.DRAFT,
            parent_goal_id=source_goal_id,
            created_at=now,
            updated_at=now,
        )
        db.add(goal)

        event = GoalEvent(
            id=str(uuid4()),
            goal_id=goal.goal_id,
            event_type=GoalEventType.CREATED,
            actor_id=employee.id,
            old_status=None,
            new_status=GoalStatus.DRAFT,
            new_text=goal.goal_text,
            event_metadata={"creation_source": "cascade", "parent_goal_id": source_goal_id},
            created_at=now,
        )
        db.add(event)
        created_ids.append(goal.goal_id)

    db.commit()
    return created_ids
