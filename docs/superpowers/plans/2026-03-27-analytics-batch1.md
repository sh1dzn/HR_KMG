# Analytics Batch 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add organization heatmap (3 modes), department benchmarking with radar charts, and AI 1-on-1 agenda generator to the HR_KMG dashboard.

**Architecture:** New `analytics.py` router (same `/dashboard` prefix) with 3 endpoints. Pydantic schemas in `schemas/analytics.py`. Three new React components (`Heatmap`, `Benchmark`, `OneOnOneModal`) integrated into existing Dashboard and EmployeeGoals pages.

**Tech Stack:** FastAPI, SQLAlchemy (joinedload), Pydantic, Recharts (RadarChart), OpenAI GPT for agenda generation

---

### Task 1: Analytics Pydantic Schemas

**Files:**
- Create: `backend/app/schemas/analytics.py`

- [ ] **Step 1: Create schemas file**

Create `backend/app/schemas/analytics.py`:

```python
"""
Pydantic schemas for analytics endpoints: heatmap, benchmark, 1-on-1 agenda
"""
from typing import Optional, List, Dict
from datetime import datetime
from pydantic import BaseModel, Field


# ── Heatmap ──────────────────────────────────────────────────────────────────

class HeatmapEmployee(BaseModel):
    id: int
    name: str
    value: float
    goals_count: int


class HeatmapDepartment(BaseModel):
    id: int
    name: str
    employee_count: int
    value: float
    breakdown: Dict[str, float]  # {"smart": 0.68, "maturity": 0.72, "progress": 0.55}
    employees: List[HeatmapEmployee]


class HeatmapResponse(BaseModel):
    departments: List[HeatmapDepartment]
    org_average: float
    mode: str


# ── Benchmark ────────────────────────────────────────────────────────────────

class BenchmarkDepartment(BaseModel):
    rank: int
    department_id: int
    department_name: str
    maturity: float
    avg_smart: float
    delta_from_avg: float
    smart_criteria: Dict[str, float]  # {"S": 0.81, "M": 0.75, ...}
    goal_count: int
    employee_count: int
    top_goals: List[str]


class BenchmarkOrgAverage(BaseModel):
    maturity: float
    avg_smart: float
    smart_criteria: Dict[str, float]


class BenchmarkResponse(BaseModel):
    ranking: List[BenchmarkDepartment]
    org_average: BenchmarkOrgAverage


# ── 1-on-1 Agenda ───────────────────────────────────────────────────────────

class OneOnOneAgendaRequest(BaseModel):
    employee_id: int
    quarter: str = Field(..., pattern=r"^Q[1-4]$")
    year: int


class AgendaItem(BaseModel):
    topic: str
    goal_id: Optional[str] = None
    goal_text: Optional[str] = None
    context: str
    suggested_questions: List[str] = []
    priority: str  # "high" | "medium" | "low"


class AgendaSummary(BaseModel):
    total_goals: int
    avg_smart: float
    overdue: int
    rejected_count: int
    alerts_count: int


class OneOnOneAgendaResponse(BaseModel):
    employee_name: str
    manager_name: Optional[str] = None
    generated_at: datetime
    agenda: List[AgendaItem]
    summary: AgendaSummary
```

- [ ] **Step 2: Verify schemas import**

Run: `cd /root/HR_KMG/backend && python3 -c "from app.schemas.analytics import HeatmapResponse, BenchmarkResponse, OneOnOneAgendaResponse; print('OK')"`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/analytics.py
git commit -m "feat(analytics): add Pydantic schemas for heatmap, benchmark, agenda"
```

---

### Task 2: Heatmap Backend Endpoint

**Files:**
- Create: `backend/app/api/analytics.py`
- Modify: `backend/app/api/__init__.py`

- [ ] **Step 1: Create analytics router with heatmap endpoint**

Create `backend/app/api/analytics.py`:

```python
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
```

- [ ] **Step 2: Register analytics router in __init__.py**

In `backend/app/api/__init__.py`, add import and router registration. After the line `from app.api import alerts, auth, goals, evaluation, generation, dashboard, employees, integrations`, change to:

```python
from app.api import alerts, analytics, auth, goals, evaluation, generation, dashboard, employees, integrations
```

Add after the dashboard router registration (after line 44):

```python
api_router.include_router(
    analytics.router,
    prefix="/dashboard",
    tags=["Расширенная аналитика"],
)
```

Add to `TAGS_METADATA` after the "Аналитика и дашборд" entry:

```python
    {"name": "Расширенная аналитика", "description": "Тепловая карта, бенчмаркинг отделов, повестка 1-on-1"},
```

- [ ] **Step 3: Verify endpoint works**

Run: `cd /root/HR_KMG/backend && python3 -c "from app.main import app; routes = [r.path for r in app.routes]; assert '/api/dashboard/heatmap' in routes; print('Heatmap route OK')"`

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/analytics.py backend/app/api/__init__.py
git commit -m "feat(analytics): add heatmap endpoint with 3 modes (smart/maturity/progress)"
```

---

### Task 3: Benchmark Backend Endpoint

**Files:**
- Modify: `backend/app/api/analytics.py`

- [ ] **Step 1: Add benchmark endpoint to analytics.py**

Append to `backend/app/api/analytics.py`:

```python
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
```

- [ ] **Step 2: Verify endpoint**

Run: `cd /root/HR_KMG/backend && python3 -c "from app.main import app; routes = [r.path for r in app.routes]; assert '/api/dashboard/benchmark' in routes; print('Benchmark route OK')"`

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/analytics.py
git commit -m "feat(analytics): add benchmark endpoint with ranking and SMART criteria"
```

---

### Task 4: 1-on-1 Agenda Backend Endpoint

**Files:**
- Modify: `backend/app/api/analytics.py`

- [ ] **Step 1: Add agenda endpoint to analytics.py**

Append to `backend/app/api/analytics.py`:

```python
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
```

- [ ] **Step 2: Verify endpoint**

Run: `cd /root/HR_KMG/backend && python3 -c "from app.main import app; routes = [r.path for r in app.routes]; assert '/api/dashboard/one-on-one-agenda' in routes; print('Agenda route OK')"`

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/analytics.py
git commit -m "feat(analytics): add 1-on-1 agenda endpoint with LLM + fallback"
```

---

### Task 5: Frontend API Functions

**Files:**
- Modify: `frontend/src/api/client.js`

- [ ] **Step 1: Add analytics API functions**

Add before the `export default client` line in `frontend/src/api/client.js`:

```javascript
// Analytics API
export const getHeatmap = async (mode = 'maturity', quarter = null, year = null) => {
  const params = { mode }
  if (quarter) params.quarter = quarter
  if (year) params.year = year
  const response = await client.get('/dashboard/heatmap', { params })
  return response.data
}

export const getBenchmark = async (quarter = null, year = null) => {
  const params = {}
  if (quarter) params.quarter = quarter
  if (year) params.year = year
  const response = await client.get('/dashboard/benchmark', { params })
  return response.data
}

export const generateOneOnOneAgenda = async (employeeId, quarter, year) => {
  const response = await client.post('/dashboard/one-on-one-agenda', {
    employee_id: employeeId,
    quarter,
    year,
  })
  return response.data
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/client.js
git commit -m "feat(analytics): add frontend API functions for heatmap, benchmark, agenda"
```

---

### Task 6: Heatmap Frontend Component

**Files:**
- Create: `frontend/src/components/Heatmap.jsx`

- [ ] **Step 1: Create Heatmap component**

Create `frontend/src/components/Heatmap.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { getHeatmap } from '../api/client'

const MODES = [
  { key: 'smart', label: 'SMART' },
  { key: 'maturity', label: 'Зрелость' },
  { key: 'progress', label: 'Прогресс' },
]

function valueColor(v) {
  if (v >= 0.7) return { bg: 'rgba(22,163,74,0.12)', border: 'rgba(22,163,74,0.3)', text: '#16a34a' }
  if (v >= 0.5) return { bg: 'rgba(234,179,8,0.12)', border: 'rgba(234,179,8,0.3)', text: '#ca8a04' }
  return { bg: 'rgba(220,38,38,0.12)', border: 'rgba(220,38,38,0.3)', text: '#dc2626' }
}

export default function Heatmap({ quarter, year }) {
  const [mode, setMode] = useState('maturity')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    setLoading(true)
    getHeatmap(mode, quarter, year)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [mode, quarter, year])

  if (loading) return <div className="text-sm py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>Загрузка тепловой карты...</div>
  if (!data) return null

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Тепловая карта организации</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Среднее по организации: {data.org_average}</p>
        </div>
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-secondary)' }}>
          {MODES.map(m => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: mode === m.key ? 'var(--bg-brand-primary)' : 'var(--bg-primary)',
                color: mode === m.key ? 'white' : 'var(--text-secondary)',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {data.departments.map(dept => {
          const c = valueColor(dept.value)
          const isExpanded = expanded === dept.id
          return (
            <div key={dept.id}>
              <button
                type="button"
                onClick={() => setExpanded(isExpanded ? null : dept.id)}
                className="w-full rounded-xl p-4 text-left transition-all"
                style={{ backgroundColor: c.bg, border: `1px solid ${c.border}` }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{dept.name}</span>
                  <span className="text-lg font-bold" style={{ color: c.text }}>{dept.value}</span>
                </div>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {dept.employee_count} сотр. &middot; {dept.employees.length} с целями
                </div>
              </button>
              {isExpanded && (
                <div className="mt-1 rounded-lg p-3 space-y-1.5" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
                  {dept.employees.slice(0, 10).map(emp => {
                    const ec = valueColor(emp.value)
                    return (
                      <div key={emp.id} className="flex items-center justify-between text-xs">
                        <span className="truncate flex-1" style={{ color: 'var(--text-secondary)' }}>{emp.name}</span>
                        <div className="flex items-center gap-2 ml-2">
                          <span style={{ color: 'var(--text-tertiary)' }}>{emp.goals_count} ц.</span>
                          <span className="font-semibold" style={{ color: ec.text }}>{emp.value}</span>
                        </div>
                      </div>
                    )
                  })}
                  {dept.employees.length > 10 && (
                    <div className="text-xs text-center pt-1" style={{ color: 'var(--text-tertiary)' }}>
                      и ещё {dept.employees.length - 10}...
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Heatmap.jsx
git commit -m "feat(analytics): add Heatmap component with 3 modes and employee drill-down"
```

---

### Task 7: Benchmark Frontend Component

**Files:**
- Create: `frontend/src/components/Benchmark.jsx`

- [ ] **Step 1: Create Benchmark component**

Create `frontend/src/components/Benchmark.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { getBenchmark } from '../api/client'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip } from 'recharts'

const MEDAL = ['🥇', '🥈', '🥉']
const RADAR_COLORS = ['#1570EF', '#E11D48', '#16A34A', '#CA8A04']
const CRITERIA_LABELS = { S: 'Конкретность', M: 'Измеримость', A: 'Достижимость', R: 'Релевантность', T: 'Срочность' }

export default function Benchmark({ quarter, year }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState([])
  const [sortKey, setSortKey] = useState('rank')
  const [sortAsc, setSortAsc] = useState(true)

  useEffect(() => {
    setLoading(true)
    getBenchmark(quarter, year)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [quarter, year])

  if (loading) return <div className="text-sm py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>Загрузка бенчмарка...</div>
  if (!data) return null

  const toggleSelect = (deptId) => {
    setSelected(prev =>
      prev.includes(deptId) ? prev.filter(id => id !== deptId) : prev.length >= 4 ? prev : [...prev, deptId]
    )
  }

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(key === 'rank') }
  }

  const sorted = [...data.ranking].sort((a, b) => {
    const dir = sortAsc ? 1 : -1
    return (a[sortKey] - b[sortKey]) * dir
  })

  // Radar data
  const radarData = Object.entries(CRITERIA_LABELS).map(([key, label]) => {
    const entry = { criterion: label }
    entry['Среднее'] = data.org_average.smart_criteria[key] || 0
    for (const deptId of selected) {
      const dept = data.ranking.find(d => d.department_id === deptId)
      if (dept) entry[dept.department_name] = dept.smart_criteria[key] || 0
    }
    return entry
  })

  const cols = [
    { key: 'rank', label: '#', w: 'w-10' },
    { key: 'department_name', label: 'Отдел', w: 'flex-1' },
    { key: 'maturity', label: 'Зрелость', w: 'w-20' },
    { key: 'avg_smart', label: 'SMART', w: 'w-20' },
    { key: 'delta_from_avg', label: 'Дельта', w: 'w-20' },
    { key: 'goal_count', label: 'Целей', w: 'w-16' },
    { key: 'employee_count', label: 'Сотр.', w: 'w-16' },
  ]

  return (
    <div className="card p-5 mb-6">
      <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Бенчмаркинг отделов</h3>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-secondary)' }}>
              <th className="w-8 px-2 py-2"></th>
              {cols.map(c => (
                <th key={c.key} onClick={() => c.key !== 'department_name' && handleSort(c.key)}
                  className={`px-2 py-2 text-left font-medium ${c.w} ${c.key !== 'department_name' ? 'cursor-pointer' : ''}`}
                  style={{ color: 'var(--text-tertiary)' }}>
                  {c.label} {sortKey === c.key ? (sortAsc ? '↑' : '↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(dept => (
              <tr key={dept.department_id}
                style={{ borderBottom: '1px solid var(--border-secondary)' }}
                className="transition-colors"
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = ''}>
                <td className="px-2 py-2.5">
                  <input type="checkbox" checked={selected.includes(dept.department_id)}
                    onChange={() => toggleSelect(dept.department_id)}
                    disabled={!selected.includes(dept.department_id) && selected.length >= 4} />
                </td>
                <td className="px-2 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                  {dept.rank <= 3 ? MEDAL[dept.rank - 1] : dept.rank}
                </td>
                <td className="px-2 py-2.5" style={{ color: 'var(--text-primary)' }}>{dept.department_name}</td>
                <td className="px-2 py-2.5 font-semibold" style={{ color: 'var(--text-primary)' }}>{dept.maturity}</td>
                <td className="px-2 py-2.5" style={{ color: 'var(--text-secondary)' }}>{dept.avg_smart}</td>
                <td className="px-2 py-2.5">
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{
                    backgroundColor: dept.delta_from_avg >= 0 ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)',
                    color: dept.delta_from_avg >= 0 ? '#16a34a' : '#dc2626',
                  }}>
                    {dept.delta_from_avg >= 0 ? '+' : ''}{dept.delta_from_avg}
                  </span>
                </td>
                <td className="px-2 py-2.5" style={{ color: 'var(--text-tertiary)' }}>{dept.goal_count}</td>
                <td className="px-2 py-2.5" style={{ color: 'var(--text-tertiary)' }}>{dept.employee_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Radar Chart */}
      {selected.length >= 2 && (
        <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--border-secondary)' }}>
          <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Сравнение по SMART-критериям</h4>
          <ResponsiveContainer width="100%" height={350}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="var(--border-secondary)" />
              <PolarAngleAxis dataKey="criterion" tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }} />
              <PolarRadiusAxis angle={90} domain={[0, 1]} tick={{ fill: 'var(--text-quaternary)', fontSize: 10 }} />
              <Radar name="Среднее" dataKey="Среднее" stroke="var(--text-quaternary)" fill="none" strokeDasharray="5 5" />
              {selected.map((deptId, i) => {
                const dept = data.ranking.find(d => d.department_id === deptId)
                return dept ? (
                  <Radar key={deptId} name={dept.department_name} dataKey={dept.department_name}
                    stroke={RADAR_COLORS[i]} fill={RADAR_COLORS[i]} fillOpacity={0.15} />
                ) : null
              })}
              <Legend />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Benchmark.jsx
git commit -m "feat(analytics): add Benchmark component with ranking table and radar chart"
```

---

### Task 8: OneOnOneModal Frontend Component

**Files:**
- Create: `frontend/src/components/OneOnOneModal.jsx`

- [ ] **Step 1: Create OneOnOneModal component**

Create `frontend/src/components/OneOnOneModal.jsx`:

```jsx
import { useState } from 'react'
import { generateOneOnOneAgenda } from '../api/client'
import AIThinking from './AIThinking'

const PRIORITY_STYLES = {
  high: { bg: 'rgba(220,38,38,0.12)', color: '#dc2626', label: 'Высокий' },
  medium: { bg: 'rgba(234,179,8,0.12)', color: '#ca8a04', label: 'Средний' },
  low: { bg: 'rgba(107,114,128,0.12)', color: '#6b7280', label: 'Низкий' },
}

export default function OneOnOneModal({ employeeId, employeeName, quarter, year, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedIdx, setExpandedIdx] = useState(null)
  const [copied, setCopied] = useState(false)

  useState(() => {
    generateOneOnOneAgenda(employeeId, quarter, year)
      .then(res => { setData(res); setLoading(false) })
      .catch(err => { setError(err.response?.data?.detail || 'Ошибка генерации'); setLoading(false) })
  }, [])

  const copyToClipboard = () => {
    if (!data) return
    const text = [
      `Повестка 1-on-1: ${data.employee_name}`,
      `Период: ${quarter} ${year}`,
      `Руководитель: ${data.manager_name || '—'}`,
      '',
      `Сводка: ${data.summary.total_goals} целей, SMART ${data.summary.avg_smart}, просрочено: ${data.summary.overdue}, отклонений: ${data.summary.rejected_count}`,
      '',
      ...data.agenda.map((item, i) => [
        `${i + 1}. [${item.priority.toUpperCase()}] ${item.topic}`,
        item.goal_text ? `   Цель: ${item.goal_text}` : '',
        `   ${item.context}`,
        ...(item.suggested_questions || []).map(q => `   - ${q}`),
        '',
      ].filter(Boolean).join('\n')),
    ].join('\n')
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(12,17,29,0.48)', backdropFilter: 'blur(2px)' }}>
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl p-6" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Повестка 1-on-1: {employeeName}
          </h2>
          <button type="button" onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg" style={{ color: 'var(--fg-quaternary)' }}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {loading && <AIThinking label="Генерация повестки..." />}
        {error && <div className="rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: 'var(--bg-error-secondary)', color: 'var(--text-error-primary)' }}>{error}</div>}

        {data && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { label: 'Целей', value: data.summary.total_goals },
                { label: 'SMART', value: data.summary.avg_smart },
                { label: 'Просроч.', value: data.summary.overdue },
                { label: 'Алертов', value: data.summary.alerts_count },
              ].map(s => (
                <div key={s.label} className="rounded-lg p-2 text-center" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{s.value}</div>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Agenda items */}
            <div className="space-y-2 mb-4">
              {data.agenda.map((item, idx) => {
                const ps = PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.low
                const isOpen = expandedIdx === idx
                return (
                  <div key={idx} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-secondary)' }}>
                    <button type="button" onClick={() => setExpandedIdx(isOpen ? null : idx)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left">
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0" style={{ backgroundColor: ps.bg, color: ps.color }}>
                        {ps.label}
                      </span>
                      <span className="text-sm font-medium flex-1" style={{ color: 'var(--text-primary)' }}>{item.topic}</span>
                      <svg className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--fg-quaternary)' }}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-3 space-y-2">
                        {item.goal_text && (
                          <p className="text-xs rounded px-2 py-1" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                            {item.goal_text}
                          </p>
                        )}
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item.context}</p>
                        {item.suggested_questions?.length > 0 && (
                          <ul className="space-y-1 pl-4">
                            {item.suggested_questions.map((q, qi) => (
                              <li key={qi} className="text-sm list-disc" style={{ color: 'var(--text-brand-primary)' }}>{q}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Copy button */}
            <button type="button" onClick={copyToClipboard}
              className="w-full rounded-lg py-2.5 text-sm font-medium transition-colors"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-secondary)' }}>
              {copied ? 'Скопировано!' : 'Скопировать повестку'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/OneOnOneModal.jsx
git commit -m "feat(analytics): add OneOnOneModal component with agenda display and clipboard copy"
```

---

### Task 9: Integrate Components into Dashboard Page

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`

- [ ] **Step 1: Add Heatmap and Benchmark imports and render**

Read `frontend/src/pages/Dashboard.jsx` first. Then:

Add imports at the top (after existing imports):

```jsx
import Heatmap from '../components/Heatmap'
import Benchmark from '../components/Benchmark'
```

In the JSX return, add the Heatmap and Benchmark components at the top of the page content, before the existing metrics grid. Find the first `<div className="grid` or content section and insert before it:

```jsx
        {/* Heatmap */}
        <Heatmap quarter={selectedQuarter} year={selectedYear} />

        {/* Benchmark */}
        <Benchmark quarter={selectedQuarter} year={selectedYear} />
```

Note: The existing Dashboard uses `quarter` and `year` state variables. Read the file to find the exact variable names and pass them. If the page doesn't have quarter/year selectors, pass `"Q2"` and `2026` as defaults.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx
git commit -m "feat(analytics): integrate Heatmap and Benchmark into Dashboard page"
```

---

### Task 10: Integrate OneOnOneModal into EmployeeGoals Page

**Files:**
- Modify: `frontend/src/pages/EmployeeGoals.jsx`

- [ ] **Step 1: Add 1-on-1 button and modal to EmployeeGoals**

Read `frontend/src/pages/EmployeeGoals.jsx` first. Then:

Add imports:

```jsx
import OneOnOneModal from '../components/OneOnOneModal'
import { useAuth } from '../contexts/AuthContext'
```

Add state for modal:

```javascript
const [agendaModal, setAgendaModal] = useState(null) // { employeeId, employeeName }
const { role } = useAuth()
```

Add the button next to employee name/header area (visible when a specific employee's goals are being viewed, and only for manager/admin role):

```jsx
{role !== 'employee' && selectedEmployeeId && (
  <button
    type="button"
    onClick={() => setAgendaModal({ employeeId: selectedEmployeeId, employeeName: selectedEmployeeName })}
    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
    style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)' }}
  >
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
    </svg>
    1-on-1
  </button>
)}
```

Add modal render at the end of the component JSX:

```jsx
{agendaModal && (
  <OneOnOneModal
    employeeId={agendaModal.employeeId}
    employeeName={agendaModal.employeeName}
    quarter="Q2"
    year={2026}
    onClose={() => setAgendaModal(null)}
  />
)}
```

Note: Read the file to find the exact variable names for selected employee. The component may use different state variable names — adapt accordingly.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/EmployeeGoals.jsx
git commit -m "feat(analytics): add 1-on-1 agenda button to EmployeeGoals page"
```

---

### Task 11: Build, Deploy, Verify

**Files:** None (verification only)

- [ ] **Step 1: Verify backend loads**

Run: `cd /root/HR_KMG/backend && python3 -c "from app.main import app; routes = [r.path for r in app.routes]; print('heatmap:', '/api/dashboard/heatmap' in routes); print('benchmark:', '/api/dashboard/benchmark' in routes); print('agenda:', '/api/dashboard/one-on-one-agenda' in routes)"`

Expected: All three `True`

- [ ] **Step 2: Verify frontend builds**

Run: `cd /root/HR_KMG/frontend && npm run build 2>&1 | tail -5`

Expected: Build succeeds

- [ ] **Step 3: Rebuild Docker containers**

Run: `cd /root/HR_KMG && docker compose up -d --build 2>&1 | tail -10`

- [ ] **Step 4: Push**

```bash
git push origin main
```
