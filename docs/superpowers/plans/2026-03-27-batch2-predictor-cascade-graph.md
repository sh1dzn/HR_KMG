# Batch 2: Predictor, Cascade, Dependency Graph — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add goal failure prediction, auto-cascading with conflict detection, and interactive dependency graph to HR_KMG.

**Architecture:** Three independent feature modules — each with its own service, API router, schemas, and frontend components. Shared DB migrations for `parent_goal_id` on goals and new `goal_dependencies` table. New `/dependencies` page with force-graph visualization.

**Tech Stack:** FastAPI, SQLAlchemy, OpenAI GPT (for explanations/conflict detection/suggestions), react-force-graph-2d, Recharts

---

## Feature A: Goal Failure Predictor

### Task 1: Prediction Schemas + Service

**Files:**
- Create: `backend/app/schemas/prediction.py`
- Create: `backend/app/services/prediction_service.py`

- [ ] **Step 1: Create prediction schemas**

Create `backend/app/schemas/prediction.py`:

```python
"""Pydantic schemas for goal failure prediction"""
from typing import Optional, List
from pydantic import BaseModel


class RiskFactor(BaseModel):
    name: str
    value: float
    label: str


class PredictionResponse(BaseModel):
    goal_id: str
    risk_score: float
    risk_level: str  # "high" | "medium" | "low"
    factors: List[RiskFactor]
    explanation: Optional[str] = None


class ExplanationResponse(BaseModel):
    explanation: str
    recommendations: List[str]


class RiskGoalItem(BaseModel):
    goal_id: str
    goal_text: str
    employee_name: Optional[str] = None
    department: Optional[str] = None
    risk_score: float


class RiskOverviewResponse(BaseModel):
    total_goals: int
    risk_distribution: dict  # {"high": N, "medium": N, "low": N}
    top_risks: List[RiskGoalItem]
```

- [ ] **Step 2: Create prediction service**

Create `backend/app/services/prediction_service.py`:

```python
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
```

- [ ] **Step 3: Verify imports**

Run: `cd /root/HR_KMG/backend && python3 -c "from app.services.prediction_service import compute_risk_score, explain_risk; from app.schemas.prediction import PredictionResponse, RiskOverviewResponse; print('OK')"`

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/prediction.py backend/app/services/prediction_service.py
git commit -m "feat(prediction): add risk scoring service and schemas"
```

---

### Task 2: Prediction API Router

**Files:**
- Create: `backend/app/api/prediction.py`
- Modify: `backend/app/api/__init__.py`
- Modify: `backend/app/api/analytics.py` (add risk-overview)

- [ ] **Step 1: Create prediction router**

Create `backend/app/api/prediction.py`:

```python
"""Goal failure prediction endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import get_current_user, require_role
from app.models import Goal, Employee
from app.models.user import User
from app.schemas.prediction import PredictionResponse, ExplanationResponse
from app.services.prediction_service import compute_risk_score, explain_risk

router = APIRouter()


@router.get("/{goal_id}/failure-prediction", response_model=PredictionResponse)
async def get_failure_prediction(
    goal_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    goal = db.query(Goal).filter(Goal.goal_id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Цель не найдена")
    return compute_risk_score(goal, db)


@router.post("/{goal_id}/failure-prediction/explain", response_model=ExplanationResponse)
async def explain_failure_prediction(
    goal_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    goal = db.query(Goal).filter(Goal.goal_id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Цель не найдена")
    prediction = compute_risk_score(goal, db)
    result = await explain_risk(goal, prediction["factors"])
    return result
```

- [ ] **Step 2: Add risk-overview to analytics.py**

Append to `backend/app/api/analytics.py`:

```python
from app.schemas.prediction import RiskOverviewResponse, RiskGoalItem
from app.services.prediction_service import compute_risk_score


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
```

- [ ] **Step 3: Register prediction router**

In `backend/app/api/__init__.py`, add `prediction` to imports and register:

```python
from app.api import alerts, analytics, auth, cascade, dependencies, goals, evaluation, generation, dashboard, employees, integrations, prediction
```

Add after goals router:
```python
api_router.include_router(
    prediction.router,
    prefix="/goals",
    tags=["Предсказание рисков"],
)
```

Add to TAGS_METADATA:
```python
    {"name": "Предсказание рисков", "description": "Оценка риска невыполнения цели, LLM-объяснение"},
```

NOTE: Also add `cascade` and `dependencies` imports now (files will be created in Tasks 4 and 7) — create empty placeholder files first:
- `backend/app/api/cascade.py` with just `from fastapi import APIRouter; router = APIRouter()`
- `backend/app/api/dependencies.py` with just `from fastapi import APIRouter; router = APIRouter()`

Register them too:
```python
api_router.include_router(cascade.router, prefix="/goals", tags=["Каскадирование целей"])
api_router.include_router(dependencies.router, prefix="/goals", tags=["Граф зависимостей"])
```

- [ ] **Step 4: Verify**

Run: `cd /root/HR_KMG/backend && python3 -c "from app.main import app; routes = [r.path for r in app.routes]; assert '/api/goals/{goal_id}/failure-prediction' in routes; assert '/api/dashboard/risk-overview' in routes; print('Prediction routes OK')"`

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/prediction.py backend/app/api/analytics.py backend/app/api/__init__.py backend/app/api/cascade.py backend/app/api/dependencies.py
git commit -m "feat(prediction): add prediction API, risk-overview endpoint, register routers"
```

---

### Task 3: Prediction Frontend (RiskBadge + API + Dashboard widget)

**Files:**
- Create: `frontend/src/components/RiskBadge.jsx`
- Modify: `frontend/src/api/client.js`
- Modify: `frontend/src/pages/Dashboard.jsx`

- [ ] **Step 1: Add API functions to client.js**

Add before `export default client`:

```javascript
// Prediction API
export const getFailurePrediction = async (goalId) => {
  const response = await client.get(`/goals/${goalId}/failure-prediction`)
  return response.data
}

export const explainFailurePrediction = async (goalId) => {
  const response = await client.post(`/goals/${goalId}/failure-prediction/explain`)
  return response.data
}

export const getRiskOverview = async (quarter = null, year = null) => {
  const params = {}
  if (quarter) params.quarter = quarter
  if (year) params.year = year
  const response = await client.get('/dashboard/risk-overview', { params })
  return response.data
}
```

- [ ] **Step 2: Create RiskBadge component**

Create `frontend/src/components/RiskBadge.jsx`:

```jsx
const RISK_COLORS = {
  high: { bg: 'rgba(220,38,38,0.15)', color: '#dc2626' },
  medium: { bg: 'rgba(234,179,8,0.15)', color: '#ca8a04' },
  low: { bg: 'rgba(22,163,74,0.15)', color: '#16a34a' },
}

export default function RiskBadge({ riskLevel, riskScore, size = 'sm' }) {
  const c = RISK_COLORS[riskLevel] || RISK_COLORS.low
  if (size === 'dot') {
    return <span className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} title={`Риск: ${riskScore}`} />
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: c.bg, color: c.color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.color }} />
      {riskScore !== undefined ? riskScore : riskLevel}
    </span>
  )
}
```

- [ ] **Step 3: Add risk widget to Dashboard**

Read `frontend/src/pages/Dashboard.jsx`. Add import:
```jsx
import { getRiskOverview } from '../api/client'
```

Add state and fetch for risk data alongside existing data loading. Add a "Цели под угрозой" card after the Benchmark section showing top 5 risks with RiskBadge.

This is integration work — read the file, find the right location, and add a section. The widget is a simple card with a list of 5 items.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/RiskBadge.jsx frontend/src/api/client.js frontend/src/pages/Dashboard.jsx
git commit -m "feat(prediction): add RiskBadge, prediction API functions, dashboard risk widget"
```

---

## Feature B: Auto-Cascading with Conflict Detection

### Task 4: Cascade Schemas + Service + Migration

**Files:**
- Create: `backend/app/schemas/cascade.py`
- Create: `backend/app/services/cascade_service.py`
- Create: `backend/scripts/add_parent_goal_id.py`
- Modify: `backend/app/models/goal.py`

- [ ] **Step 1: Add parent_goal_id to Goal model**

In `backend/app/models/goal.py`, add to the Goal class after `priority` (line 77):

```python
    parent_goal_id = Column(UUID(as_uuid=False), ForeignKey("goals.goal_id"), nullable=True)
```

Add relationship:
```python
    parent_goal = relationship("Goal", remote_side=[goal_id], foreign_keys=[parent_goal_id])
```

- [ ] **Step 2: Create migration script**

Create `backend/scripts/add_parent_goal_id.py`:

```python
"""Add parent_goal_id column to goals table."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sqlalchemy import text
from app.database import engine

def migrate():
    with engine.begin() as conn:
        conn.execute(text("""
            ALTER TABLE goals ADD COLUMN IF NOT EXISTS parent_goal_id UUID REFERENCES goals(goal_id);
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_goals_parent_goal_id ON goals(parent_goal_id);"))
    print("Added parent_goal_id to goals table.")

if __name__ == "__main__":
    migrate()
```

- [ ] **Step 3: Create cascade schemas**

Create `backend/app/schemas/cascade.py`:

```python
"""Pydantic schemas for cascade operations"""
from typing import Optional, List
from pydantic import BaseModel


class CascadePreviewRequest(BaseModel):
    target_department_ids: List[int]
    goals_per_department: int = 2


class CascadedGoalItem(BaseModel):
    text: str
    suggested_weight: float
    rationale: str


class CascadedDepartment(BaseModel):
    department_id: int
    department_name: str
    goals: List[CascadedGoalItem]


class ConflictGoalRef(BaseModel):
    text: str
    department: str


class ConflictItem(BaseModel):
    type: str  # "contradiction" | "duplicate" | "resource"
    goal_a: ConflictGoalRef
    goal_b: ConflictGoalRef
    explanation: str


class CascadePreviewResponse(BaseModel):
    source_goal: dict  # {"id": str, "text": str}
    cascaded_goals: List[CascadedDepartment]
    conflicts: List[ConflictItem]
    conflict_count: int


class CascadeConfirmGoal(BaseModel):
    department_id: int
    employee_id: int
    text: str
    weight: float
    quarter: str
    year: int


class CascadeConfirmRequest(BaseModel):
    goals: List[CascadeConfirmGoal]


class CascadeConfirmResponse(BaseModel):
    created_count: int
    goal_ids: List[str]
```

- [ ] **Step 4: Create cascade service**

Create `backend/app/services/cascade_service.py`:

```python
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
        employee = db.query(Employee).filter(Employee.id == g["employee_id"]).first()
        if not employee:
            continue

        goal = Goal(
            goal_id=str(uuid4()),
            employee_id=g["employee_id"],
            department_id=g["department_id"],
            employee_name_snapshot=employee.full_name,
            position_snapshot=employee.position.name if employee.position else None,
            department_name_snapshot=employee.department.name if employee.department else None,
            goal_text=g["text"],
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
```

- [ ] **Step 5: Run migration**

Run: `cd /root/HR_KMG/backend && python3 -m scripts.add_parent_goal_id`

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/goal.py backend/app/schemas/cascade.py backend/app/services/cascade_service.py backend/scripts/add_parent_goal_id.py
git commit -m "feat(cascade): add cascade service, schemas, parent_goal_id migration"
```

---

### Task 5: Cascade API Router

**Files:**
- Modify: `backend/app/api/cascade.py` (replace placeholder)

- [ ] **Step 1: Implement cascade endpoints**

Replace `backend/app/api/cascade.py`:

```python
"""Cascade endpoints — preview and confirm goal cascading"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import require_role
from app.models import Goal
from app.models.user import User
from app.schemas.cascade import (
    CascadePreviewRequest, CascadePreviewResponse,
    CascadeConfirmRequest, CascadeConfirmResponse,
)
from app.services.cascade_service import generate_cascade_preview, confirm_cascade

router = APIRouter()


@router.post("/{goal_id}/cascade-preview", response_model=CascadePreviewResponse)
async def cascade_preview(
    goal_id: str,
    body: CascadePreviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "admin")),
):
    goal = db.query(Goal).filter(Goal.goal_id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Цель не найдена")
    status = goal.status.value if hasattr(goal.status, "value") else goal.status
    if status not in ("approved", "in_progress"):
        raise HTTPException(status_code=400, detail="Каскадировать можно только утверждённые цели")

    result = await generate_cascade_preview(goal, body.target_department_ids, body.goals_per_department, db)
    return result


@router.post("/{goal_id}/cascade-confirm", response_model=CascadeConfirmResponse)
async def cascade_confirm(
    goal_id: str,
    body: CascadeConfirmRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "admin")),
):
    goal = db.query(Goal).filter(Goal.goal_id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Цель не найдена")

    created_ids = confirm_cascade(str(goal.goal_id), [g.model_dump() for g in body.goals], db)
    return CascadeConfirmResponse(created_count=len(created_ids), goal_ids=created_ids)
```

- [ ] **Step 2: Verify**

Run: `cd /root/HR_KMG/backend && python3 -c "from app.main import app; routes = [r.path for r in app.routes]; assert '/api/goals/{goal_id}/cascade-preview' in routes; print('Cascade routes OK')"`

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/cascade.py
git commit -m "feat(cascade): add cascade preview and confirm endpoints"
```

---

### Task 6: Cascade Frontend (CascadeModal + API)

**Files:**
- Create: `frontend/src/components/CascadeModal.jsx`
- Modify: `frontend/src/api/client.js`

- [ ] **Step 1: Add cascade API functions to client.js**

Add before `export default client`:

```javascript
// Cascade API
export const cascadePreview = async (goalId, targetDepartmentIds, goalsPerDept = 2) => {
  const response = await client.post(`/goals/${goalId}/cascade-preview`, {
    target_department_ids: targetDepartmentIds,
    goals_per_department: goalsPerDept,
  })
  return response.data
}

export const cascadeConfirm = async (goalId, goals) => {
  const response = await client.post(`/goals/${goalId}/cascade-confirm`, { goals })
  return response.data
}
```

- [ ] **Step 2: Create CascadeModal component**

Create `frontend/src/components/CascadeModal.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { cascadePreview, cascadeConfirm, getEmployees } from '../api/client'
import AIThinking from './AIThinking'

const CONFLICT_STYLES = {
  contradiction: { bg: 'rgba(220,38,38,0.12)', color: '#dc2626', label: 'Противоречие' },
  duplicate: { bg: 'rgba(234,179,8,0.12)', color: '#ca8a04', label: 'Дубликат' },
  resource: { bg: 'rgba(249,115,22,0.12)', color: '#ea580c', label: 'Ресурсный конфликт' },
}

export default function CascadeModal({ goalId, goalText, departments, quarter, year, onClose, onConfirmed }) {
  const [step, setStep] = useState(1)
  const [selectedDepts, setSelectedDepts] = useState([])
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState(null)

  const toggleDept = (id) => setSelectedDepts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const handlePreview = async () => {
    if (!selectedDepts.length) return
    setLoading(true)
    setError(null)
    try {
      const data = await cascadePreview(goalId, selectedDepts)
      setPreview(data)
      setStep(2)
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка генерации')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!preview) return
    setConfirming(true)
    try {
      const goals = []
      for (const dept of preview.cascaded_goals) {
        for (const g of dept.goals) {
          goals.push({
            department_id: dept.department_id,
            employee_id: 0, // Will need employee selection — use first employee in dept for now
            text: g.text,
            weight: g.suggested_weight,
            quarter, year,
          })
        }
      }
      await cascadeConfirm(goalId, goals)
      onConfirmed?.()
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка создания целей')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(12,17,29,0.48)', backdropFilter: 'blur(2px)' }}>
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl p-6" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Каскадирование цели</h2>
          <button type="button" onClick={onClose} style={{ color: 'var(--fg-quaternary)' }}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <p className="text-sm mb-4 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          {goalText}
        </p>

        {error && <div className="rounded-lg px-3 py-2 mb-4 text-sm" style={{ backgroundColor: 'var(--bg-error-secondary)', color: 'var(--text-error-primary)' }}>{error}</div>}

        {step === 1 && (
          <>
            <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Выберите отделы</h3>
            <div className="space-y-2 mb-4">
              {departments.map(d => (
                <label key={d.id} className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer" style={{ backgroundColor: selectedDepts.includes(d.id) ? 'var(--bg-brand-secondary)' : 'var(--bg-secondary)' }}>
                  <input type="checkbox" checked={selectedDepts.includes(d.id)} onChange={() => toggleDept(d.id)} />
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{d.name}</span>
                </label>
              ))}
            </div>
            <button onClick={handlePreview} disabled={!selectedDepts.length || loading}
              className="gradient-brand w-full rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-60">
              {loading ? 'Генерация...' : 'Preview'}
            </button>
            {loading && <AIThinking label="Генерация каскадных целей..." />}
          </>
        )}

        {step === 2 && preview && (
          <>
            {/* Conflicts */}
            {preview.conflicts.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold mb-2" style={{ color: '#dc2626' }}>Обнаружены конфликты ({preview.conflict_count})</h3>
                <div className="space-y-2">
                  {preview.conflicts.map((c, i) => {
                    const cs = CONFLICT_STYLES[c.type] || CONFLICT_STYLES.contradiction
                    return (
                      <div key={i} className="rounded-lg p-3" style={{ backgroundColor: cs.bg, border: `1px solid ${cs.color}30` }}>
                        <span className="text-xs font-medium" style={{ color: cs.color }}>{cs.label}</span>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>{c.explanation}</p>
                        <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                          {c.goal_a.department}: "{c.goal_a.text?.slice(0, 60)}..." vs {c.goal_b.department}: "{c.goal_b.text?.slice(0, 60)}..."
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Generated goals by department */}
            {preview.cascaded_goals.map(dept => (
              <div key={dept.department_id} className="mb-4">
                <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{dept.department_name}</h3>
                <div className="space-y-2">
                  {dept.goals.map((g, i) => (
                    <div key={i} className="rounded-lg p-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
                      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{g.text}</p>
                      <div className="flex gap-4 mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        <span>Вес: {g.suggested_weight}%</span>
                        <span>{g.rationale}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 rounded-lg py-2.5 text-sm font-medium"
                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)' }}>
                Назад
              </button>
              <button onClick={handleConfirm} disabled={confirming}
                className="flex-1 gradient-brand rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-60">
                {confirming ? 'Создание...' : 'Подтвердить каскад'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CascadeModal.jsx frontend/src/api/client.js
git commit -m "feat(cascade): add CascadeModal component and API functions"
```

---

## Feature C: Dependency Graph

### Task 7: Dependency Model + Migration

**Files:**
- Create: `backend/app/models/dependency.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/scripts/create_dependencies_table.py`

- [ ] **Step 1: Create dependency model**

Create `backend/app/models/dependency.py`:

```python
"""GoalDependency model for tracking goal relationships"""
import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import Column, DateTime, ForeignKey, CheckConstraint, UniqueConstraint
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class DependencyType(str, Enum):
    BLOCKS = "blocks"
    RELATES_TO = "relates_to"
    CASCADED_FROM = "cascaded_from"


class DependencyStatus(str, Enum):
    ACTIVE = "active"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class DependencyCreatedBy(str, Enum):
    MANUAL = "manual"
    AI_SUGGESTED = "ai_suggested"
    CASCADE = "cascade"


class GoalDependency(Base):
    __tablename__ = "goal_dependencies"
    __table_args__ = (
        UniqueConstraint("source_goal_id", "target_goal_id", name="uq_goal_dependency"),
        CheckConstraint("source_goal_id != target_goal_id", name="ck_no_self_dependency"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_goal_id = Column(UUID(as_uuid=False), ForeignKey("goals.goal_id"), nullable=False, index=True)
    target_goal_id = Column(UUID(as_uuid=False), ForeignKey("goals.goal_id"), nullable=False, index=True)
    dependency_type = Column(
        SQLEnum(DependencyType, name="dependency_type_enum", values_callable=lambda e: [i.value for i in e]),
        nullable=False,
    )
    status = Column(
        SQLEnum(DependencyStatus, name="dependency_status_enum", values_callable=lambda e: [i.value for i in e]),
        nullable=False,
        default=DependencyStatus.ACTIVE,
    )
    created_by = Column(
        SQLEnum(DependencyCreatedBy, name="dependency_created_by_enum", values_callable=lambda e: [i.value for i in e]),
        nullable=False,
        default=DependencyCreatedBy.MANUAL,
    )
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    source_goal = relationship("Goal", foreign_keys=[source_goal_id])
    target_goal = relationship("Goal", foreign_keys=[target_goal_id])
```

- [ ] **Step 2: Register in models/__init__.py**

Add to imports and __all__ in `backend/app/models/__init__.py`:
```python
from app.models.dependency import GoalDependency, DependencyType, DependencyStatus, DependencyCreatedBy
```

- [ ] **Step 3: Create migration script**

Create `backend/scripts/create_dependencies_table.py`:

```python
"""Create goal_dependencies table."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sqlalchemy import text
from app.database import engine

def create_table():
    with engine.begin() as conn:
        for enum_name, values in [
            ("dependency_type_enum", "'blocks','relates_to','cascaded_from'"),
            ("dependency_status_enum", "'active','resolved','dismissed'"),
            ("dependency_created_by_enum", "'manual','ai_suggested','cascade'"),
        ]:
            conn.execute(text(f"DO $$ BEGIN CREATE TYPE {enum_name} AS ENUM ({values}); EXCEPTION WHEN duplicate_object THEN null; END $$;"))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS goal_dependencies (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                source_goal_id UUID NOT NULL REFERENCES goals(goal_id),
                target_goal_id UUID NOT NULL REFERENCES goals(goal_id),
                dependency_type dependency_type_enum NOT NULL,
                status dependency_status_enum NOT NULL DEFAULT 'active',
                created_by dependency_created_by_enum NOT NULL DEFAULT 'manual',
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT uq_goal_dependency UNIQUE (source_goal_id, target_goal_id),
                CONSTRAINT ck_no_self_dependency CHECK (source_goal_id != target_goal_id)
            );
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_goal_deps_source ON goal_dependencies(source_goal_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_goal_deps_target ON goal_dependencies(target_goal_id);"))
    print("goal_dependencies table created.")

if __name__ == "__main__":
    create_table()
```

- [ ] **Step 4: Run migrations**

Run: `cd /root/HR_KMG/backend && python3 -m scripts.create_dependencies_table`

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/dependency.py backend/app/models/__init__.py backend/scripts/create_dependencies_table.py
git commit -m "feat(deps): add GoalDependency model and migration"
```

---

### Task 8: Dependency Schemas + Service

**Files:**
- Create: `backend/app/schemas/dependency.py`
- Create: `backend/app/services/dependency_service.py`

- [ ] **Step 1: Create dependency schemas**

Create `backend/app/schemas/dependency.py`:

```python
"""Pydantic schemas for dependency graph"""
from typing import Optional, List
from pydantic import BaseModel


class CreateDependencyRequest(BaseModel):
    target_goal_id: str
    dependency_type: str  # "blocks" | "relates_to" | "cascaded_from"


class UpdateDependencyRequest(BaseModel):
    status: str  # "active" | "resolved" | "dismissed"


class GraphNode(BaseModel):
    id: str
    text: str
    status: str
    department: Optional[str] = None
    employee_name: Optional[str] = None
    risk_score: float = 0.0
    is_blocker: bool = False
    dependency_count: int = 0


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    type: str
    status: str


class BlockerInfo(BaseModel):
    goal_id: str
    goal_text: str
    blocked_count: int
    status: str
    department: Optional[str] = None


class DependencyGraphResponse(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    blockers: List[BlockerInfo]


class DependencySuggestion(BaseModel):
    target_goal_id: str
    target_text: str
    target_department: Optional[str] = None
    type: str
    confidence: float
    reason: str


class SuggestDependenciesResponse(BaseModel):
    suggestions: List[DependencySuggestion]
```

- [ ] **Step 2: Create dependency service**

Create `backend/app/services/dependency_service.py`:

```python
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
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/dependency.py backend/app/services/dependency_service.py
git commit -m "feat(deps): add dependency service and schemas"
```

---

### Task 9: Dependency API Router

**Files:**
- Modify: `backend/app/api/dependencies.py` (replace placeholder)

- [ ] **Step 1: Implement dependency endpoints**

Replace `backend/app/api/dependencies.py`:

```python
"""Dependency graph endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import require_role
from app.models import Goal
from app.models.dependency import GoalDependency, DependencyStatus
from app.models.user import User
from app.schemas.dependency import (
    CreateDependencyRequest, UpdateDependencyRequest,
    DependencyGraphResponse, SuggestDependenciesResponse,
)
from app.services.dependency_service import get_dependency_graph, create_dependency, suggest_dependencies
from typing import Optional

router = APIRouter()


@router.get("/dependency-graph", response_model=DependencyGraphResponse)
async def get_graph(
    quarter: Optional[str] = None,
    year: Optional[int] = None,
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "admin")),
):
    return get_dependency_graph(db, quarter, year, department_id)


@router.post("/{goal_id}/dependencies")
async def add_dependency(
    goal_id: str,
    body: CreateDependencyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "admin")),
):
    source = db.query(Goal).filter(Goal.goal_id == goal_id).first()
    target = db.query(Goal).filter(Goal.goal_id == body.target_goal_id).first()
    if not source or not target:
        raise HTTPException(status_code=404, detail="Цель не найдена")
    if goal_id == body.target_goal_id:
        raise HTTPException(status_code=400, detail="Нельзя создать зависимость на себя")

    existing = db.query(GoalDependency).filter(
        GoalDependency.source_goal_id == goal_id,
        GoalDependency.target_goal_id == body.target_goal_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Зависимость уже существует")

    dep = create_dependency(db, goal_id, body.target_goal_id, body.dependency_type)
    return {"id": str(dep.id), "status": "created"}


@router.post("/{goal_id}/suggest-dependencies", response_model=SuggestDependenciesResponse)
async def suggest_deps(
    goal_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "admin")),
):
    goal = db.query(Goal).filter(Goal.goal_id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Цель не найдена")
    q = goal.quarter.value if hasattr(goal.quarter, "value") else goal.quarter
    suggestions = await suggest_dependencies(db, goal, q, goal.year)
    return {"suggestions": suggestions}


@router.put("/dependencies/{dep_id}")
async def update_dependency(
    dep_id: str,
    body: UpdateDependencyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "admin")),
):
    dep = db.query(GoalDependency).filter(GoalDependency.id == dep_id).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Зависимость не найдена")
    dep.status = body.status
    db.commit()
    return {"id": str(dep.id), "status": dep.status}


@router.delete("/dependencies/{dep_id}")
async def delete_dependency(
    dep_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "admin")),
):
    dep = db.query(GoalDependency).filter(GoalDependency.id == dep_id).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Зависимость не найдена")
    db.delete(dep)
    db.commit()
    return {"message": "Зависимость удалена"}
```

- [ ] **Step 2: Verify**

Run: `cd /root/HR_KMG/backend && python3 -c "from app.main import app; routes = [r.path for r in app.routes]; assert '/api/goals/dependency-graph' in routes; assert '/api/goals/{goal_id}/suggest-dependencies' in routes; print('Dependency routes OK')"`

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/dependencies.py
git commit -m "feat(deps): add dependency graph, CRUD, and AI suggestion endpoints"
```

---

### Task 10: Dependency Frontend (Graph page + API)

**Files:**
- Modify: `frontend/src/api/client.js`
- Create: `frontend/src/pages/Dependencies.jsx`
- Modify: `frontend/src/App.jsx` (add route + nav)

- [ ] **Step 1: Add dependency API functions to client.js**

Add before `export default client`:

```javascript
// Dependency API
export const getDependencyGraph = async (quarter = null, year = null, departmentId = null) => {
  const params = {}
  if (quarter) params.quarter = quarter
  if (year) params.year = year
  if (departmentId) params.department_id = departmentId
  const response = await client.get('/goals/dependency-graph', { params })
  return response.data
}

export const addDependency = async (goalId, targetGoalId, type) => {
  const response = await client.post(`/goals/${goalId}/dependencies`, {
    target_goal_id: targetGoalId, dependency_type: type,
  })
  return response.data
}

export const suggestDependencies = async (goalId) => {
  const response = await client.post(`/goals/${goalId}/suggest-dependencies`)
  return response.data
}

export const updateDependency = async (depId, status) => {
  const response = await client.put(`/goals/dependencies/${depId}`, { status })
  return response.data
}

export const deleteDependency = async (depId) => {
  const response = await client.delete(`/goals/dependencies/${depId}`)
  return response.data
}
```

- [ ] **Step 2: Install react-force-graph-2d**

Run: `cd /root/HR_KMG/frontend && npm install react-force-graph-2d`

- [ ] **Step 3: Create Dependencies page**

Create `frontend/src/pages/Dependencies.jsx`:

```jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { getDependencyGraph } from '../api/client'
import ForceGraph2D from 'react-force-graph-2d'

const STATUS_COLORS = {
  done: '#16a34a', approved: '#16a34a',
  in_progress: '#1570EF', submitted: '#ca8a04',
  overdue: '#dc2626', cancelled: '#6b7280',
  draft: '#9ca3af', active: '#3b82f6',
}
const EDGE_COLORS = { blocks: '#dc2626', relates_to: '#9ca3af', cascaded_from: '#1570EF' }

export default function Dependencies() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const graphRef = useRef()

  useEffect(() => {
    setLoading(true)
    getDependencyGraph('Q2', 2026)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const graphData = data ? {
    nodes: data.nodes.map(n => ({
      ...n,
      color: STATUS_COLORS[n.status] || '#9ca3af',
      val: Math.max(2, n.dependency_count * 2),
    })),
    links: data.edges.map(e => ({
      ...e,
      color: EDGE_COLORS[e.type] || '#9ca3af',
    })),
  } : { nodes: [], links: [] }

  const handleNodeClick = useCallback((node) => {
    setSelected(node)
    graphRef.current?.centerAt(node.x, node.y, 500)
    graphRef.current?.zoom(3, 500)
  }, [])

  if (loading) return <div className="text-sm py-16 text-center" style={{ color: 'var(--text-tertiary)' }}>Загрузка графа зависимостей...</div>

  return (
    <div className="flex gap-4 h-[calc(100vh-140px)]">
      {/* Graph */}
      <div className="flex-1 rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}>
        {data && data.nodes.length > 0 ? (
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            nodeLabel={n => `${n.text}\n${n.department || ''} — ${n.employee_name || ''}`}
            nodeColor={n => n.color}
            nodeVal={n => n.val}
            linkColor={l => l.color}
            linkWidth={l => l.type === 'blocks' ? 2 : 1}
            linkDirectionalArrowLength={6}
            linkDirectionalArrowRelPos={1}
            onNodeClick={handleNodeClick}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const size = node.val || 4
              ctx.beginPath()
              ctx.arc(node.x, node.y, size, 0, 2 * Math.PI)
              ctx.fillStyle = node.color
              ctx.fill()
              if (node.is_blocker) {
                ctx.strokeStyle = '#dc2626'
                ctx.lineWidth = 2
                ctx.stroke()
              }
              if (globalScale > 1.5) {
                ctx.font = `${10 / globalScale}px sans-serif`
                ctx.fillStyle = 'var(--text-primary)'
                ctx.textAlign = 'center'
                ctx.fillText(node.text?.slice(0, 30) || '', node.x, node.y + size + 8 / globalScale)
              }
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Нет зависимостей для отображения
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="w-72 flex-shrink-0 space-y-4">
        {/* Legend */}
        <div className="card p-4">
          <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-tertiary)' }}>Легенда</h3>
          <div className="space-y-1.5">
            {[['Блокирует', '#dc2626'], ['Связано', '#9ca3af'], ['Каскад', '#1570EF']].map(([label, color]) => (
              <div key={label} className="flex items-center gap-2 text-xs">
                <span className="h-0.5 w-4 rounded" style={{ backgroundColor: color }} />
                <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Blockers */}
        {data?.blockers?.length > 0 && (
          <div className="card p-4">
            <h3 className="text-xs font-semibold mb-2" style={{ color: '#dc2626' }}>Блокеры ({data.blockers.length})</h3>
            <div className="space-y-2">
              {data.blockers.slice(0, 5).map(b => (
                <div key={b.goal_id} className="text-xs">
                  <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{b.goal_text}</p>
                  <p style={{ color: 'var(--text-tertiary)' }}>Блокирует {b.blocked_count} ц. · {b.department}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Selected node detail */}
        {selected && (
          <div className="card p-4">
            <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-tertiary)' }}>Выбранная цель</h3>
            <p className="text-sm mb-1" style={{ color: 'var(--text-primary)' }}>{selected.text}</p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {selected.department} · {selected.employee_name} · {selected.status}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Зависимостей: {selected.dependency_count} · Риск: {selected.risk_score}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add route and nav in App.jsx**

Read `frontend/src/App.jsx`. Add import:
```jsx
import Dependencies from './pages/Dependencies'
```

Add to navigation array (before Settings, for manager+ role):
```javascript
{
  name: 'Граф зависимостей', href: '/dependencies',
  icon: /* use existing icon or simple SVG */,
  roles: ['manager', 'admin'],
},
```

Add route:
```jsx
<Route path="/dependencies" element={<ProtectedRoute allowedRoles={['manager', 'admin']}><Dependencies /></ProtectedRoute>} />
```

Add to pageTitles: `'/dependencies': 'Граф зависимостей'`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.js frontend/src/pages/Dependencies.jsx frontend/src/App.jsx frontend/package.json frontend/package-lock.json
git commit -m "feat(deps): add dependency graph page with force visualization"
```

---

### Task 11: Build, Deploy, Verify

**Files:** None (verification + deployment)

- [ ] **Step 1: Verify backend**

Run: `cd /root/HR_KMG/backend && python3 -c "
from app.main import app
routes = [r.path for r in app.routes]
checks = [
    '/api/goals/{goal_id}/failure-prediction',
    '/api/goals/{goal_id}/failure-prediction/explain',
    '/api/dashboard/risk-overview',
    '/api/goals/{goal_id}/cascade-preview',
    '/api/goals/{goal_id}/cascade-confirm',
    '/api/goals/dependency-graph',
    '/api/goals/{goal_id}/dependencies',
    '/api/goals/{goal_id}/suggest-dependencies',
]
for c in checks:
    print(f'{c}: {c in routes}')
"`

- [ ] **Step 2: Build frontend**

Run: `cd /root/HR_KMG/frontend && npm run build 2>&1 | tail -5`

- [ ] **Step 3: Run migrations in Docker**

Run:
```bash
cd /root/HR_KMG && docker compose up -d --build backend
docker exec hr_ai_backend python -m scripts.add_parent_goal_id
docker exec hr_ai_backend python -m scripts.create_dependencies_table
```

- [ ] **Step 4: Rebuild frontend container**

Run:
```bash
docker stop hr_ai_frontend 2>/dev/null; docker rm hr_ai_frontend 2>/dev/null
docker compose up -d --build frontend
lsof -ti:3000 | xargs kill -9 2>/dev/null; docker compose up -d frontend
```

- [ ] **Step 5: Push**

```bash
git push origin main
```
