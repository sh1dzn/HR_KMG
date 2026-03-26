# Batch 2: Failure Predictor, Auto-Cascade, Dependency Graph

**Date:** 2026-03-27
**Status:** Approved
**Scope:** 3 features with new DB table, new services, new page

---

## Context

HR_KMG has 9K goals, 30K events, 450 employees across 8 departments. Batch 1 added heatmap, benchmarking, 1-on-1 agenda. Batch 2 adds predictive analytics, intelligent cascading, and goal dependency management.

---

## 1. Goal Failure Predictor

### Backend

#### Statistical scoring: `GET /api/goals/{goal_id}/failure-prediction`

Auth: any authenticated user. Returns instantly (no LLM).

Factors and weights (risk_score 0.0–1.0, where 1.0 = high risk):

| Factor | Weight | Formula |
|--------|--------|---------|
| smart_quality | 0.20 | `1 - smart_score` |
| rejections | 0.20 | `min(rejection_count / 3, 1.0)` |
| stagnation | 0.20 | `min(days_in_current_status / 30, 1.0)` |
| deadline_pressure | 0.25 | if overdue: 1.0, else `1 - (days_remaining / total_days)`, no deadline: 0.3 |
| dept_history | 0.15 | `1 - (dept_done_count / dept_total_count)` for past quarters, no history: 0.5 |

Risk levels: high (>0.7), medium (0.4–0.7), low (<0.4)

Response:
```json
{
  "goal_id": "uuid",
  "risk_score": 0.73,
  "risk_level": "high",
  "factors": [
    { "name": "deadline_pressure", "value": 0.95, "label": "Дедлайн через 3 дня, прогресс не начат" },
    { "name": "rejections", "value": 0.67, "label": "Отклонена 2 раза" },
    { "name": "smart_quality", "value": 0.55, "label": "SMART-скор 0.45" },
    { "name": "stagnation", "value": 0.40, "label": "В статусе submitted 12 дней" },
    { "name": "dept_history", "value": 0.30, "label": "Отдел выполняет 70% целей" }
  ],
  "explanation": null
}
```

#### LLM explanation: `POST /api/goals/{goal_id}/failure-prediction/explain`

Auth: any authenticated. Takes the factors + goal context, sends to LLM, returns:
```json
{
  "explanation": "Цель имеет высокий риск невыполнения из-за...",
  "recommendations": [
    "Пересмотреть дедлайн с учётом текущей загрузки",
    "Разбить цель на 2-3 подцели с промежуточными контрольными точками"
  ]
}
```

Fallback (no LLM): return explanation built from factor labels, no recommendations.

#### Batch risk overview: `GET /api/dashboard/risk-overview`

Auth: manager+. Query params: `quarter`, `year`.

Response:
```json
{
  "total_goals": 120,
  "risk_distribution": { "high": 15, "medium": 45, "low": 60 },
  "top_risks": [
    { "goal_id": "uuid", "goal_text": "...", "employee_name": "...", "department": "...", "risk_score": 0.91 }
  ]
}
```

`top_risks`: top 10 goals by risk_score.

### New service: `backend/app/services/prediction_service.py`

Functions:
- `compute_risk_score(goal, db)` → dict with risk_score, risk_level, factors
- `compute_risk_factors(goal, heuristic, events, dept_history)` → list of factor dicts
- `explain_risk(goal, factors)` → LLM explanation + recommendations
- `batch_risk_overview(goals, db)` → aggregated risk data

### Frontend

- Traffic light badge on each goal in EmployeeGoals list: red/yellow/green circle
- In GoalModal: "Риск провала" section with factor bars + "Объяснить" button (triggers LLM)
- On Dashboard: "Цели под угрозой" widget showing top 5 by risk_score

---

## 2. Auto-Cascading with Conflict Detection

### Backend

#### New field on Goal model

`parent_goal_id` — UUID, FK → goals.goal_id, nullable. Tracks cascade chains.

Migration: `ALTER TABLE goals ADD COLUMN parent_goal_id UUID REFERENCES goals(goal_id);`

#### Cascade preview: `POST /api/goals/{goal_id}/cascade-preview`

Auth: manager+

Request:
```json
{
  "target_department_ids": [1, 2, 3],
  "goals_per_department": 2
}
```

Logic:
1. Load source goal (must be approved or in_progress)
2. For each target department: load existing goals, fetch relevant ВНД docs via RAG
3. LLM generates cascade goals per department with rationale and suggested weights
4. Conflict detection: send all generated + existing goals across all target departments to LLM in one call
5. LLM returns typed conflicts: `contradiction`, `duplicate`, `resource`

Response:
```json
{
  "source_goal": { "id": "uuid", "text": "..." },
  "cascaded_goals": [
    {
      "department_id": 1,
      "department_name": "Производство",
      "goals": [
        { "text": "...", "suggested_weight": 30, "rationale": "..." }
      ]
    }
  ],
  "conflicts": [
    {
      "type": "contradiction",
      "goal_a": { "text": "...", "department": "Закупки" },
      "goal_b": { "text": "...", "department": "Производство" },
      "explanation": "Цели противоречат: снижение затрат несовместимо с увеличением объёма"
    }
  ],
  "conflict_count": 2
}
```

#### Cascade confirm: `POST /api/goals/{goal_id}/cascade-confirm`

Auth: manager+

Request:
```json
{
  "goals": [
    {
      "department_id": 1,
      "employee_id": 101,
      "text": "...",
      "weight": 30,
      "quarter": "Q2",
      "year": 2026
    }
  ]
}
```

Creates goals in DB with `parent_goal_id` set to the source goal. Creates GoalEvent with `creation_source: "cascade"` metadata.

### New service: `backend/app/services/cascade_service.py`

Functions:
- `generate_cascade_preview(source_goal, target_departments, goals_per_dept, db)` → preview response
- `detect_conflicts(generated_goals, existing_goals)` → list of conflict dicts (LLM call)
- `confirm_cascade(source_goal_id, goals_data, db)` → list of created goals

### Frontend

Button "Каскадировать" in GoalModal — visible for manager+ on approved/in_progress goals.

Cascade modal:
- Step 1: select target departments (checkboxes)
- Step 2: click "Preview" → shows generated goals per department + conflict cards
- Conflict cards: red (contradiction), yellow (duplicate), orange (resource) with explanation
- Editable goal text/weight before confirm
- Step 3: "Подтвердить каскад" → creates goals

---

## 3. Goal Dependency Graph

### Backend

#### New table `goal_dependencies`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK, default uuid4 |
| source_goal_id | UUID FK | goals.goal_id, NOT NULL — the goal that depends/waits |
| target_goal_id | UUID FK | goals.goal_id, NOT NULL — the blocking/related goal |
| dependency_type | ENUM | `blocks`, `relates_to`, `cascaded_from` |
| status | ENUM | `active`, `resolved`, `dismissed` |
| created_by | ENUM | `manual`, `ai_suggested`, `cascade` |
| created_at | TIMESTAMP | default now() |

Constraint: source_goal_id != target_goal_id. Unique on (source_goal_id, target_goal_id).

Enum types: `dependency_type_enum`, `dependency_status_enum`, `dependency_created_by_enum`.

#### Endpoints

`GET /api/goals/dependency-graph`

Auth: manager+. Query params: `quarter`, `year`, `department_id` (optional).

```json
{
  "nodes": [
    {
      "id": "uuid",
      "text": "...",
      "status": "in_progress",
      "department": "Производство",
      "employee_name": "Иванов",
      "risk_score": 0.6,
      "is_blocker": true,
      "dependency_count": 3
    }
  ],
  "edges": [
    { "id": "uuid", "source": "uuid-a", "target": "uuid-b", "type": "blocks", "status": "active" }
  ],
  "blockers": [
    { "goal_id": "uuid", "goal_text": "...", "blocked_count": 3, "status": "overdue", "department": "..." }
  ]
}
```

`POST /api/goals/{goal_id}/dependencies`

Auth: manager+. Manual dependency creation.
```json
{ "target_goal_id": "uuid", "dependency_type": "blocks" }
```

`POST /api/goals/{goal_id}/suggest-dependencies`

Auth: manager+. AI suggests dependencies by analyzing goal text against all goals in quarter.
```json
{
  "suggestions": [
    {
      "target_goal_id": "uuid",
      "target_text": "...",
      "target_department": "...",
      "type": "blocks",
      "confidence": 0.85,
      "reason": "Внедрение мониторинга требует завершения интеграции с 1С"
    }
  ]
}
```

`PUT /api/goals/dependencies/{dep_id}`

Auth: manager+. Update status (active/resolved/dismissed).

`DELETE /api/goals/dependencies/{dep_id}`

Auth: manager+.

#### Auto blocker alerts

When a goal status changes to `overdue` or `cancelled`, check if it has active `blocks` dependencies. If yes, create alerts for all dependent goals via existing alert_service.

### New model: `backend/app/models/dependency.py`

SQLAlchemy model for `GoalDependency` with enums `DependencyType`, `DependencyStatus`, `DependencyCreatedBy`.

### New service: `backend/app/services/dependency_service.py`

Functions:
- `get_dependency_graph(db, quarter, year, department_id)` → nodes, edges, blockers
- `create_dependency(db, source_goal_id, target_goal_id, dep_type, created_by)` → GoalDependency
- `suggest_dependencies(db, goal, all_goals)` → LLM-generated suggestions
- `check_blocker_alerts(db, goal)` → create alerts if goal blocks others

### Frontend

**New page `/dependencies`** — added to sidebar nav for manager+.

Graph visualization:
- Uses `react-force-graph-2d` npm package
- Nodes colored by status (green=done, blue=in_progress, yellow=submitted, red=overdue, gray=draft)
- Node size proportional to dependency_count
- Edge colors: red (blocks), gray (relates_to), blue (cascaded_from)
- Blockers highlighted with pulsing border
- Filter panel: department, quarter, dependency type
- Click node → sidebar panel with goal details + dependencies list + "Add dependency" button

**In GoalModal:** "Зависимости" section:
- List of current dependencies with type badges
- "Найти связи (AI)" button → shows suggestions with Accept/Dismiss buttons
- "Добавить вручную" → search goals, select, choose type

**New npm dependency:** `react-force-graph-2d`

---

## 4. Shared Implementation Details

### New files

Backend:
- `backend/app/models/dependency.py` — GoalDependency model + enums
- `backend/app/services/prediction_service.py` — risk scoring
- `backend/app/services/cascade_service.py` — cascade generation + conflict detection
- `backend/app/services/dependency_service.py` — graph queries + AI suggestions
- `backend/app/api/prediction.py` — prediction endpoints
- `backend/app/api/cascade.py` — cascade endpoints
- `backend/app/api/dependencies.py` — dependency endpoints
- `backend/app/schemas/prediction.py` — prediction schemas
- `backend/app/schemas/cascade.py` — cascade schemas
- `backend/app/schemas/dependency.py` — dependency schemas
- `backend/scripts/create_dependencies_table.py` — migration

Frontend:
- `frontend/src/components/RiskBadge.jsx` — traffic light badge
- `frontend/src/components/RiskDetail.jsx` — factor bars + explain button
- `frontend/src/components/CascadeModal.jsx` — cascade preview + conflict cards
- `frontend/src/components/DependencyGraph.jsx` — force graph visualization
- `frontend/src/components/DependencySuggestions.jsx` — AI suggestions panel
- `frontend/src/pages/Dependencies.jsx` — full page with graph + filters

### Router registration

Three new routers in `api/__init__.py`:
- `prediction.router` prefix `/goals` (nested under existing goals path)
- `cascade.router` prefix `/goals` (nested under existing goals path)
- `dependencies.router` prefix `/goals` (for dependency CRUD + graph)

### Auth

- Prediction (single goal): any authenticated
- Prediction explain: any authenticated
- Risk overview: manager+
- Cascade preview/confirm: manager+
- Dependency graph/CRUD: manager+
- AI suggest dependencies: manager+

---

## 5. What Is NOT In Scope

- ML model training (statistical formula only)
- Real-time notifications for blocker changes (alert on status change only)
- Cascade to specific employees (cascade targets departments, employee assignment done manually)
- Circular dependency detection (enforce at creation: prevent A→B→A)
- Dependency graph 3D view
- Export/print of dependency graph
