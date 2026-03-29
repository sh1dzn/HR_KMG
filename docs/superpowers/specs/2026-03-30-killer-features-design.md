# Killer Features Design Spec

## Feature 1: SMART Coach — Real-time scoring as you type

### UX Flow
1. User opens dedicated page or modal with a large textarea
2. As they type a goal, 5 SMART criteria indicators update live (debounced 600ms)
3. Each criterion shows: icon + label + score bar + color (red < 0.5, yellow 0.5-0.7, green >= 0.7)
4. Overall score ring animates in center
5. Below criteria: inline suggestions panel with specific improvement tips
6. "Улучшить с AI" button calls LLM for full reformulation

### Technical Design

**Backend:** `GET /api/evaluation/quick-score?text=...`
- Uses existing `evaluate_goal_heuristically()` — pure heuristics, no LLM, <10ms response
- Returns: 5 criteria scores + overall + brief tips array

**Frontend:** `SmartCoach.jsx` component
- Debounced API call on text change (600ms)
- Animated score bars with CSS transitions
- Circular overall score indicator (SVG)
- Tips generated from low-scoring criteria
- "Улучшить с AI" button calls existing `/api/evaluation/reformulate`

### Scoring Display
- S (Конкретность): checks for vague words, action verbs
- M (Измеримость): checks for numbers, %, KPI keywords
- A (Достижимость): checks for realistic scope signals
- R (Релевантность): checks for role/department alignment
- T (Сроки): checks for dates, quarters, deadlines

---

## Feature 2: Strategy Map — Visual strategy-to-goals cascade

### UX Flow
1. Admin/manager opens Strategy Map page
2. System loads strategy documents from DB and extracts key objectives via LLM
3. Interactive tree renders: Strategy objectives → Department goals → Individual goals
4. Color coding: green (covered), yellow (partial), red (gap — no goals)
5. Click on gap node → "Generate goals" button → AI creates goals to fill the gap
6. Animated tree building effect on first load

### Technical Design

**Backend:** `POST /api/strategy/analyze`
- Loads all strategy-type documents from DB
- LLM extracts 5-8 strategic objectives from combined strategy text
- For each objective, searches existing goals using RAG similarity
- Groups matched goals by department
- Returns tree structure with coverage scores

**Backend:** `POST /api/strategy/fill-gap`
- Takes objective text + target department
- Generates goals using existing goal_generator service
- Returns generated goals for preview

**Frontend:** `StrategyMap.jsx` page
- Tree layout with SVG nodes and connecting lines
- Root: "Стратегия компании"
- Level 1: Strategic objectives (from LLM)
- Level 2: Department clusters
- Level 3: Individual goals (matched)
- Gap nodes pulsing red with "+" button
- Animated build effect (nodes appear sequentially)

### Tree Node Structure
```
{
  objectives: [
    {
      id, title, description,
      coverage_score: 0-1,
      departments: [
        {
          id, name,
          goals: [{ id, text, smart_score, employee_name }],
          gap: true/false
        }
      ]
    }
  ]
}
```
