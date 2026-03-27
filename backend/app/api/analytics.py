"""
Analytics API endpoints: heatmap, benchmarking, 1-on-1 agenda
Registered under /dashboard prefix alongside existing dashboard routes.
"""
from datetime import datetime, date, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies.auth import require_role
from app.models import Department, Employee, Goal, GoalEvent, GoalEventType, GoalReview, GoalStatus
from app.models.user import User
from app.config import settings
from app.schemas.analytics import (
    AgendaItem,
    AgendaSummary,
    BenchmarkDepartment,
    BenchmarkOrgAverage,
    BenchmarkResponse,
    HeatmapDepartment,
    HeatmapEmployee,
    HeatmapResponse,
    OneOnOneAgendaRequest,
    OneOnOneAgendaResponse,
)
from app.utils.smart_heuristics import evaluate_goal_heuristically
from app.utils.goal_context import load_generation_metadata, strategic_link_for_goal, goal_type_for_goal
from app.schemas.prediction import RiskOverviewResponse, RiskGoalItem
from app.services.prediction_service import compute_risk_score

router = APIRouter()


# ── Shared helpers ───────────────────────────────────────────────────────────

def _compute_heuristics_cache(goals: list[Goal]) -> dict[str, dict]:
    """Compute heuristic evaluation once per goal, return dict keyed by goal_id."""
    cache = {}
    for goal in goals:
        cache[str(goal.goal_id)] = evaluate_goal_heuristically(
            goal.goal_text, goal.metric, goal.deadline, goal.priority
        )
    return cache


def _avg(values: list[float]) -> float:
    return round(sum(values) / len(values), 2) if values else 0.0


def _maturity_for_goals(goals: list[Goal], heuristics: dict[str, dict], gen_meta: dict[str, dict]) -> float:
    """Compute 5-factor maturity index for a set of goals."""
    if not goals:
        return 0.0

    scores = [heuristics[str(g.goal_id)]["overall_score"] for g in goals]
    smart_factor = _avg(scores)

    strategic_count = sum(1 for g in goals if strategic_link_for_goal(g, gen_meta.get(str(g.goal_id))) == "strategic")
    strategic_factor = strategic_count / len(goals)

    oi_count = sum(1 for g in goals if goal_type_for_goal(g, gen_meta.get(str(g.goal_id))) in ("output", "impact"))
    type_factor = oi_count / len(goals)

    total_weight = sum(float(g.weight or 0) for g in goals)
    weight_factor = max(0, 1 - abs(total_weight - 100) / 100)

    emp_counts: dict[int, int] = {}
    for g in goals:
        emp_counts[g.employee_id] = emp_counts.get(g.employee_id, 0) + 1
    valid_count = sum(1 for c in emp_counts.values() if 3 <= c <= 5)
    count_factor = valid_count / len(emp_counts) if emp_counts else 0

    return round(
        smart_factor * 0.30 + strategic_factor * 0.20 + type_factor * 0.20
        + weight_factor * 0.15 + count_factor * 0.15,
        2,
    )


def _progress_for_goals(goals: list[Goal]) -> float:
    """Fraction of goals that are done or approved."""
    if not goals:
        return 0.0
    done = sum(1 for g in goals if (g.status.value if hasattr(g.status, "value") else g.status) in ("done", "approved"))
    return round(done / len(goals), 2)


# ── Heatmap ──────────────────────────────────────────────────────────────────

@router.get("/heatmap", response_model=HeatmapResponse)
async def get_heatmap(
    mode: str = "maturity",
    quarter: Optional[str] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "admin")),
):
    if mode not in ("smart", "maturity", "progress"):
        raise HTTPException(status_code=400, detail="mode must be smart, maturity, or progress")

    # Load all goals with employee eagerly
    goals_query = db.query(Goal).options(joinedload(Goal.employee))
    if quarter:
        goals_query = goals_query.filter(Goal.quarter == quarter)
    if year:
        goals_query = goals_query.filter(Goal.year == year)
    all_goals = goals_query.all()

    departments = db.query(Department).filter(Department.is_active == True).all()
    heuristics = _compute_heuristics_cache(all_goals)
    gen_meta = load_generation_metadata(db, [g.goal_id for g in all_goals])

    # Group goals by department
    dept_goals: dict[int, list[Goal]] = {}
    for g in all_goals:
        emp = g.employee
        if emp:
            dept_goals.setdefault(emp.department_id, []).append(g)

    # Group goals by employee
    emp_goals: dict[int, list[Goal]] = {}
    for g in all_goals:
        emp_goals.setdefault(g.employee_id, []).append(g)

    all_values = []
    dept_results = []

    for dept in departments:
        goals = dept_goals.get(dept.id, [])
        if not goals:
            continue

        smart_val = _avg([heuristics[str(g.goal_id)]["overall_score"] for g in goals])
        maturity_val = _maturity_for_goals(goals, heuristics, gen_meta)
        progress_val = _progress_for_goals(goals)

        breakdown = {"smart": smart_val, "maturity": maturity_val, "progress": progress_val}
        value = breakdown[mode]
        all_values.append(value)

        # Employee-level
        seen_employees = {}
        for g in goals:
            emp = g.employee
            if not emp or emp.id in seen_employees:
                continue
            eg = emp_goals.get(emp.id, [])
            if mode == "smart":
                ev = _avg([heuristics[str(x.goal_id)]["overall_score"] for x in eg])
            elif mode == "maturity":
                ev = _maturity_for_goals(eg, heuristics, gen_meta)
            else:
                ev = _progress_for_goals(eg)
            seen_employees[emp.id] = HeatmapEmployee(
                id=emp.id,
                name=emp.full_name,
                value=ev,
                goals_count=len(eg),
            )

        employees_in_dept = db.query(Employee).filter(
            Employee.department_id == dept.id, Employee.is_active == True
        ).count()

        dept_results.append(HeatmapDepartment(
            id=dept.id,
            name=dept.name,
            employee_count=employees_in_dept,
            value=value,
            breakdown=breakdown,
            employees=sorted(seen_employees.values(), key=lambda e: e.value, reverse=True),
        ))

    dept_results.sort(key=lambda d: d.value, reverse=True)

    return HeatmapResponse(
        departments=dept_results,
        org_average=_avg(all_values),
        mode=mode,
    )


# ── Benchmark ────────────────────────────────────────────────────────────────

@router.get("/benchmark", response_model=BenchmarkResponse)
async def get_benchmark(
    quarter: Optional[str] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "admin")),
):
    goals_query = db.query(Goal).options(joinedload(Goal.employee))
    if quarter:
        goals_query = goals_query.filter(Goal.quarter == quarter)
    if year:
        goals_query = goals_query.filter(Goal.year == year)
    all_goals = goals_query.all()

    departments = db.query(Department).filter(Department.is_active == True).all()
    heuristics = _compute_heuristics_cache(all_goals)
    gen_meta = load_generation_metadata(db, [g.goal_id for g in all_goals])

    # Group by department
    dept_goals: dict[int, list[Goal]] = {}
    for g in all_goals:
        if g.employee:
            dept_goals.setdefault(g.employee.department_id, []).append(g)

    dept_results = []
    all_maturities = []
    all_smart_scores = []
    org_criteria = {"S": 0.0, "M": 0.0, "A": 0.0, "R": 0.0, "T": 0.0}
    org_goal_count = 0

    for dept in departments:
        goals = dept_goals.get(dept.id, [])
        if not goals:
            continue

        # SMART scores and criteria
        scores = []
        criteria = {"S": 0.0, "M": 0.0, "A": 0.0, "R": 0.0, "T": 0.0}
        for g in goals:
            h = heuristics[str(g.goal_id)]
            scores.append(h["overall_score"])
            d = h["smart_details"]
            criteria["S"] += d["specific"]["score"]
            criteria["M"] += d["measurable"]["score"]
            criteria["A"] += d["achievable"]["score"]
            criteria["R"] += d["relevant"]["score"]
            criteria["T"] += d["time_bound"]["score"]

        n = len(goals)
        avg_smart = _avg(scores)
        avg_criteria = {k: round(v / n, 2) for k, v in criteria.items()}
        maturity = _maturity_for_goals(goals, heuristics, gen_meta)

        # Accumulate for org average
        all_maturities.append(maturity)
        all_smart_scores.extend(scores)
        for k in org_criteria:
            org_criteria[k] += criteria[k]
        org_goal_count += n

        # Top 2 goals by SMART score
        sorted_goals = sorted(goals, key=lambda g: heuristics[str(g.goal_id)]["overall_score"], reverse=True)
        top_goals = [g.goal_text for g in sorted_goals[:2]]

        # Employee count
        emp_ids = set(g.employee_id for g in goals)

        dept_results.append(BenchmarkDepartment(
            rank=0,  # assigned after sort
            department_id=dept.id,
            department_name=dept.name,
            maturity=maturity,
            avg_smart=avg_smart,
            delta_from_avg=0.0,  # assigned after org avg computed
            smart_criteria=avg_criteria,
            goal_count=n,
            employee_count=len(emp_ids),
            top_goals=top_goals,
        ))

    # Sort and assign ranks
    dept_results.sort(key=lambda d: d.maturity, reverse=True)
    org_avg_maturity = _avg(all_maturities)
    org_avg_smart = _avg(all_smart_scores)
    org_avg_criteria = {k: round(v / org_goal_count, 2) if org_goal_count else 0.0 for k, v in org_criteria.items()}

    for i, d in enumerate(dept_results):
        d.rank = i + 1
        d.delta_from_avg = round(d.maturity - org_avg_maturity, 2)

    return BenchmarkResponse(
        ranking=dept_results,
        org_average=BenchmarkOrgAverage(
            maturity=org_avg_maturity,
            avg_smart=org_avg_smart,
            smart_criteria=org_avg_criteria,
        ),
    )


# ── 1-on-1 Agenda ───────────────────────────────────────────────────────────

def _build_fallback_agenda(
    goals: list[Goal],
    heuristics: dict[str, dict],
    events_by_goal: dict[str, list],
    today: date,
) -> list[AgendaItem]:
    """Build agenda without LLM — sort issues by severity."""
    items = []

    for goal in goals:
        gid = str(goal.goal_id)
        h = heuristics.get(gid, {})
        score = h.get("overall_score", 0)
        status = goal.status.value if hasattr(goal.status, "value") else goal.status
        rejection_count = sum(
            1 for e in events_by_goal.get(gid, [])
            if (e.event_type.value if hasattr(e.event_type, "value") else e.event_type) == "rejected"
        )

        # Overdue
        if goal.deadline and goal.deadline < today and status not in ("done", "cancelled", "archived"):
            days_overdue = (today - goal.deadline).days
            items.append(AgendaItem(
                topic="Просроченная цель",
                goal_id=gid,
                goal_text=goal.goal_text,
                context=f"Дедлайн прошёл {days_overdue} дн. назад, статус: {status}",
                priority="high",
            ))

        # Rejected multiple times
        if rejection_count >= 2:
            items.append(AgendaItem(
                topic="Многократно отклонённая цель",
                goal_id=gid,
                goal_text=goal.goal_text,
                context=f"Отклонена {rejection_count} раз(а), текущий SMART-скор: {score}",
                priority="high",
            ))
        elif rejection_count == 1 and score < settings.SMART_THRESHOLD_MEDIUM:
            items.append(AgendaItem(
                topic="Отклонённая цель с низким качеством",
                goal_id=gid,
                goal_text=goal.goal_text,
                context=f"Отклонена 1 раз, SMART-скор: {score}",
                priority="medium",
            ))

        # Low SMART score (not already covered by rejection)
        if score < settings.SMART_THRESHOLD_LOW and rejection_count == 0:
            weak = [k for k, v in h.get("smart_details", {}).items()
                    if isinstance(v, dict) and v.get("score", 1) < settings.SMART_THRESHOLD_LOW]
            weak_names = {"specific": "конкретность", "measurable": "измеримость",
                         "achievable": "достижимость", "relevant": "релевантность", "time_bound": "срок"}
            weak_labels = ", ".join(weak_names.get(w, w) for w in weak)
            items.append(AgendaItem(
                topic="Цель с низким качеством",
                goal_id=gid,
                goal_text=goal.goal_text,
                context=f"SMART-скор: {score}. Слабые критерии: {weak_labels}" if weak_labels else f"SMART-скор: {score}",
                priority="high" if score < 0.3 else "medium",
            ))

    # Weight balance check
    total_weight = sum(float(g.weight or 0) for g in goals)
    if goals and abs(total_weight - 100) > 1:
        items.append(AgendaItem(
            topic="Дисбаланс весов",
            context=f"Сумма весов: {round(total_weight, 1)}% (должно быть 100%)",
            priority="medium",
        ))

    # Sort: high first, then medium, then low
    priority_order = {"high": 0, "medium": 1, "low": 2}
    items.sort(key=lambda x: priority_order.get(x.priority, 2))
    return items


def _build_llm_agenda_prompt(
    employee_name: str,
    position: str,
    department: str,
    quarter: str,
    year: int,
    goals_context: list[dict],
    alerts_context: list[str],
) -> tuple[str, str]:
    """Build system and user prompts for LLM agenda generation."""
    system = (
        "Ты — HR-коуч. Сгенерируй повестку встречи 1-on-1 между руководителем и сотрудником на русском языке. "
        "Верни JSON-массив объектов с полями: topic (str), goal_id (str|null), goal_text (str|null), "
        "context (str), suggested_questions (list[str]), priority ('high'|'medium'|'low'). "
        "Приоритизируй: просроченные цели, отклонённые цели, низкие SMART-скоры, проблемы с весами. "
        "Верни ТОЛЬКО JSON-массив без обёрток."
    )

    goals_text = "\n".join(
        f"- [{g['id']}] \"{g['text']}\" | статус: {g['status']} | SMART: {g['score']} | "
        f"вес: {g['weight']}% | дедлайн: {g['deadline']} | отклонений: {g['rejections']} | "
        f"комментарии: {g['comments']}"
        for g in goals_context
    )
    alerts_text = "\n".join(f"- {a}" for a in alerts_context) if alerts_context else "Нет алертов"

    user = (
        f"Сотрудник: {employee_name}, должность: {position}, отдел: {department}\n"
        f"Период: {quarter} {year}\n\n"
        f"Цели:\n{goals_text}\n\n"
        f"Алерты:\n{alerts_text}\n\n"
        f"Сгенерируй повестку 1-on-1 (3-7 пунктов)."
    )
    return system, user


@router.get("/risk-overview", response_model=RiskOverviewResponse)
async def get_risk_overview(
    quarter: Optional[str] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "admin")),
):
    goals_query = db.query(Goal).options(joinedload(Goal.employee))
    if quarter:
        goals_query = goals_query.filter(Goal.quarter == quarter)
    if year:
        goals_query = goals_query.filter(Goal.year == year)
    all_goals = goals_query.all()

    distribution = {"high": 0, "medium": 0, "low": 0}
    scored = []
    for goal in all_goals:
        pred = compute_risk_score(goal, db)
        distribution[pred["risk_level"]] += 1
        emp = goal.employee
        scored.append(RiskGoalItem(
            goal_id=pred["goal_id"],
            goal_text=goal.goal_text[:100],
            employee_name=emp.full_name if emp else None,
            department=emp.department.name if emp and emp.department else None,
            risk_score=pred["risk_score"],
        ))

    scored.sort(key=lambda x: x.risk_score, reverse=True)

    return RiskOverviewResponse(
        total_goals=len(all_goals),
        risk_distribution=distribution,
        top_risks=scored[:10],
    )


@router.post("/one-on-one-agenda", response_model=OneOnOneAgendaResponse)
async def generate_one_on_one_agenda(
    body: OneOnOneAgendaRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "admin")),
):
    # Load employee
    employee = db.query(Employee).options(
        joinedload(Employee.department),
        joinedload(Employee.position),
        joinedload(Employee.manager),
    ).filter(Employee.id == body.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    # Load goals
    goals = db.query(Goal).filter(
        Goal.employee_id == body.employee_id,
        Goal.quarter == body.quarter,
        Goal.year == body.year,
    ).all()

    if not goals:
        return OneOnOneAgendaResponse(
            employee_name=employee.full_name,
            manager_name=employee.manager.full_name if employee.manager else None,
            generated_at=datetime.now(timezone.utc),
            agenda=[AgendaItem(topic="Нет целей за период", context=f"У сотрудника нет целей за {body.quarter} {body.year}", priority="medium")],
            summary=AgendaSummary(total_goals=0, avg_smart=0, overdue=0, rejected_count=0, alerts_count=0),
        )

    # Compute heuristics
    heuristics = _compute_heuristics_cache(goals)
    goal_ids = [g.goal_id for g in goals]

    # Load events
    events = db.query(GoalEvent).filter(GoalEvent.goal_id.in_([str(gid) for gid in goal_ids])).all()
    events_by_goal: dict[str, list] = {}
    for e in events:
        events_by_goal.setdefault(str(e.goal_id), []).append(e)

    # Load reviews
    reviews = db.query(GoalReview).filter(GoalReview.goal_id.in_([str(gid) for gid in goal_ids])).all()

    # Compute summary
    today = date.today()
    scores = [heuristics[str(g.goal_id)]["overall_score"] for g in goals]
    overdue_count = sum(
        1 for g in goals
        if g.deadline and g.deadline < today
        and (g.status.value if hasattr(g.status, "value") else g.status) not in ("done", "cancelled", "archived")
    )
    rejection_count = sum(
        1 for e in events
        if (e.event_type.value if hasattr(e.event_type, "value") else e.event_type) == "rejected"
    )

    # Build alerts context
    from app.services.alert_service import alert_service
    gen_meta = load_generation_metadata(db, goal_ids)
    alerts_messages = []
    for g in goals:
        goal_alerts = alert_service.build_goal_alerts(g, employee, gen_meta.get(str(g.goal_id)))
        alerts_messages.extend(a.message for a in goal_alerts)

    summary = AgendaSummary(
        total_goals=len(goals),
        avg_smart=_avg(scores),
        overdue=overdue_count,
        rejected_count=rejection_count,
        alerts_count=len(alerts_messages),
    )

    # Try LLM generation
    agenda_items = []
    try:
        from app.services.llm_service import llm_service
        import json

        goals_context = []
        for g in goals:
            gid = str(g.goal_id)
            h = heuristics[gid]
            rej = sum(1 for e in events_by_goal.get(gid, [])
                      if (e.event_type.value if hasattr(e.event_type, "value") else e.event_type) == "rejected")
            comments = [
                (e.event_metadata or {}).get("comment", "")
                for e in events_by_goal.get(gid, [])
                if (e.event_metadata or {}).get("comment")
            ]
            goals_context.append({
                "id": gid,
                "text": g.goal_text[:200],
                "status": g.status.value if hasattr(g.status, "value") else g.status,
                "score": h["overall_score"],
                "weight": float(g.weight or 0),
                "deadline": str(g.deadline) if g.deadline else "не указан",
                "rejections": rej,
                "comments": "; ".join(comments[:3]) if comments else "нет",
            })

        system_prompt, user_prompt = _build_llm_agenda_prompt(
            employee.full_name,
            employee.position.name if employee.position else "не указана",
            employee.department.name if employee.department else "не указан",
            body.quarter, body.year,
            goals_context, alerts_messages[:10],
        )

        raw = await llm_service.complete_json(user_prompt, system_prompt=system_prompt)
        if isinstance(raw, list):
            for item in raw:
                agenda_items.append(AgendaItem(
                    topic=item.get("topic", "Тема"),
                    goal_id=item.get("goal_id"),
                    goal_text=item.get("goal_text"),
                    context=item.get("context", ""),
                    suggested_questions=item.get("suggested_questions", []),
                    priority=item.get("priority", "medium"),
                ))
    except Exception:
        pass  # Fall back to heuristic agenda

    # Fallback if LLM failed or returned nothing
    if not agenda_items:
        agenda_items = _build_fallback_agenda(goals, heuristics, events_by_goal, today)

    return OneOnOneAgendaResponse(
        employee_name=employee.full_name,
        manager_name=employee.manager.full_name if employee.manager else None,
        generated_at=datetime.now(timezone.utc),
        agenda=agenda_items,
        summary=summary,
    )
