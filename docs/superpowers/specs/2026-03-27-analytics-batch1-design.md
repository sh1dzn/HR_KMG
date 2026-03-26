# Analytics Batch 1: Heatmap, Benchmarking, 1-on-1 Agenda

**Date:** 2026-03-27
**Status:** Approved
**Scope:** 3 features added to existing Dashboard and employee pages

---

## Context

HR_KMG has a Dashboard with maturity index, trends, and department stats. This batch adds three analytics features: organization heatmap with 3 modes, department benchmarking with radar charts, and AI-generated 1-on-1 meeting agendas. All features build on existing data (goals, SMART heuristics, alerts, workflow events).

---

## 1. Organization Heatmap

### Backend

**Endpoint:** `GET /api/dashboard/heatmap`

**Query params:**
- `mode` — `smart` | `maturity` | `progress` (default: `maturity`)
- `quarter` — optional, e.g. `Q2`
- `year` — optional, e.g. `2026`

**Response:**
```json
{
  "departments": [
    {
      "id": 1,
      "name": "Производство",
      "employee_count": 45,
      "value": 0.72,
      "breakdown": { "smart": 0.68, "maturity": 0.72, "progress": 0.55 },
      "employees": [
        { "id": 101, "name": "Иванов П.А.", "value": 0.85, "goals_count": 4 }
      ]
    }
  ],
  "org_average": 0.67,
  "mode": "maturity"
}
```

**Mode calculations:**
- `smart` — average `evaluate_goal_heuristically()` overall_score across all goals in department
- `maturity` — reuse existing maturity index calculation from `_department_stats()`
- `progress` — count of goals with status `done` or `approved` divided by total goals

**Implementation:**
- New function in `dashboard.py` that loads all departments with goals in a single query
- Compute heuristics once per goal, cache in dict, reuse across all three modes
- Employee-level values use same mode logic but scoped to individual
- Use `joinedload(Goal.employee)` to avoid N+1

### Frontend

New section at the top of Dashboard page, above existing content.

**Layout:**
- Mode switcher: 3 buttons — `SMART | Зрелость | Прогресс`
- Grid of department cards (responsive: 2 cols mobile, 3 cols tablet, 4 cols desktop)
- Each card: department name, employee count, numeric value, background color gradient
- Color scale: red (< 0.5) → yellow (0.5-0.7) → green (> 0.7)
- Click on card → expands to show employee list with mini colored bars
- Org average shown as a reference line/badge

---

## 2. Department Benchmarking

### Backend

**Endpoint:** `GET /api/dashboard/benchmark`

**Query params:**
- `quarter` — optional
- `year` — optional

**Response:**
```json
{
  "ranking": [
    {
      "rank": 1,
      "department_id": 3,
      "department_name": "Финансы",
      "maturity": 0.82,
      "avg_smart": 0.78,
      "delta_from_avg": 0.15,
      "smart_criteria": { "S": 0.81, "M": 0.75, "A": 0.80, "R": 0.77, "T": 0.82 },
      "goal_count": 52,
      "employee_count": 12,
      "top_goals": [
        "Обеспечить сдачу отчётности в срок с точностью 99%",
        "Внедрить систему автоматического мониторинга до 30.06.2026"
      ]
    }
  ],
  "org_average": {
    "maturity": 0.67,
    "avg_smart": 0.63,
    "smart_criteria": { "S": 0.65, "M": 0.60, "A": 0.68, "R": 0.62, "T": 0.61 }
  }
}
```

**Implementation:**
- Single pass over all goals grouped by department
- Compute heuristics once per goal (share cache with heatmap if same request)
- Sort departments by maturity descending, assign rank
- `top_goals`: select 2 goals with highest SMART score from each department
- `delta_from_avg`: department maturity minus org average maturity
- `org_average.smart_criteria`: average of each criterion across all departments

### Frontend

New section on Dashboard below heatmap.

**Ranking table:**
- Columns: #, Отдел, Зрелость, SMART, Дельта, Целей, Сотрудников
- Top 3 rows with medal icons (gold/silver/bronze)
- Sortable by clicking column headers
- Delta shown as colored badge: green (+), red (-)
- Checkbox on each row for radar comparison

**Radar chart:**
- Hidden by default, appears when 2+ departments selected via checkboxes
- Recharts `RadarChart` with `PolarGrid`, `PolarAngleAxis`, `PolarRadiusAxis`
- 5 axes: S (Конкретность), M (Измеримость), A (Достижимость), R (Релевантность), T (Срочность)
- Each selected department as a colored polygon with legend
- Max 4 departments selectable (more gets unreadable)
- Org average shown as dashed polygon for reference

---

## 3. AI 1-on-1 Meeting Agenda Generator

### Backend

**Endpoint:** `POST /api/dashboard/one-on-one-agenda`

**Auth:** `require_role("manager", "admin")`

**Request:**
```json
{
  "employee_id": 101,
  "quarter": "Q2",
  "year": 2026
}
```

**Response:**
```json
{
  "employee_name": "Иванов Пётр Алексеевич",
  "manager_name": "Сидорова Мария Ивановна",
  "generated_at": "2026-03-27T10:00:00Z",
  "agenda": [
    {
      "topic": "Цель с низким качеством",
      "goal_id": "uuid-here",
      "goal_text": "Улучшить работу отдела",
      "context": "SMART-скор 0.35, отклонена 2 раза, без метрики и срока",
      "suggested_questions": [
        "Какой конкретный результат вы ожидаете?",
        "Как будем измерять прогресс?"
      ],
      "priority": "high"
    }
  ],
  "summary": {
    "total_goals": 5,
    "avg_smart": 0.58,
    "overdue": 1,
    "rejected_count": 3,
    "alerts_count": 4
  }
}
```

**Context assembly (before LLM call):**
1. Load employee with department, position, manager (joinedload)
2. Load all goals for employee+quarter+year
3. Compute SMART heuristics for each goal
4. Load goal_events: count rejections, extract comments
5. Load goal_reviews: extract reviewer feedback
6. Load alerts via `alert_service.build_goal_alerts()` for each goal
7. Check overdue goals (deadline < today, status not done/cancelled)
8. Check weight balance (sum of weights != 100)

**LLM prompt structure:**
- System: "You are an HR coach. Generate a 1-on-1 meeting agenda in Russian."
- Context: employee name, position, department, quarter
- Goals list with: text, status, SMART score, metric, deadline, weight, rejection count, comments
- Alerts list
- Instruction: "Prioritize: overdue goals, rejected goals, low SMART scores, weight issues. Return JSON array of agenda items."

**Fallback (no LLM):**
- Sort issues by severity: overdue > rejected > low SMART > weight issues > stagnation
- Return agenda items without `suggested_questions` field
- Set `context` from alert messages directly

### Frontend

**Button placement:**
- EmployeeGoals page: button in header bar when an employee is selected, visible for manager+ role
- Approvals page: small button next to each employee name, visible for manager+ role

**Modal:**
- Title: "Повестка 1-on-1: {employee_name}"
- Summary bar: total goals, avg SMART, overdue count, alerts count
- Agenda items as expandable cards:
  - Header: topic + priority badge (high=red, medium=yellow, low=gray)
  - Expanded: goal text, context, suggested questions as bullet list
- Footer: "Скопировать" button — copies agenda as formatted plain text to clipboard
- Loading state: AIThinking component (already exists)

---

## 4. Shared Implementation Details

### Heuristic caching within request

All three features call `evaluate_goal_heuristically()` per goal. To avoid redundant computation:
- Compute heuristics once when goals are loaded
- Store in `dict[goal_id, heuristic_result]`
- Pass through to all serialization functions

### New Pydantic schemas

Create `backend/app/schemas/analytics.py` with:
- `HeatmapDepartment`, `HeatmapEmployee`, `HeatmapResponse`
- `BenchmarkDepartment`, `BenchmarkResponse`
- `AgendaItem`, `AgendaSummary`, `OneOnOneAgendaRequest`, `OneOnOneAgendaResponse`

### Dashboard.py split

Current `dashboard.py` is 301 lines. Adding 3 endpoints will push it to ~500+. Split into:
- `backend/app/api/dashboard.py` — existing 4 endpoints (untouched)
- `backend/app/api/analytics.py` — new 3 endpoints (heatmap, benchmark, agenda)
- Register analytics router in `api/__init__.py` with prefix `/dashboard` (same URL space)

### Frontend component structure

- `frontend/src/components/Heatmap.jsx` — heatmap grid with mode switcher
- `frontend/src/components/Benchmark.jsx` — ranking table + radar chart
- `frontend/src/components/OneOnOneModal.jsx` — agenda modal with copy
- Integrate into existing `Dashboard.jsx` and `EmployeeGoals.jsx`

### Auth

- Heatmap: `require_role("manager", "admin")` — same as existing dashboard
- Benchmark: `require_role("manager", "admin")`
- 1-on-1 Agenda: `require_role("manager", "admin")`

---

## 5. What Is NOT In Scope

- Saving/editing generated agendas (generate-only, copy to clipboard)
- Historical agenda comparison
- Email/Slack delivery of agendas
- Custom heatmap color scales
- Exporting benchmark data
- Real-time updates (standard request-response)
