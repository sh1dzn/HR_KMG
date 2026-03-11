"""
Lightweight SMART heuristics for dashboards and DB-backed goal summaries.
"""
import re
from typing import Any, Dict


def _contains_metric(text: str) -> bool:
    return bool(re.search(r"\d|%|kpi|sla|nps|roi|срок|дней|месяц|квартал", text.lower()))


def _contains_timeframe(text: str) -> bool:
    return bool(re.search(r"\bq[1-4]\b|20\d{2}|квартал|месяц|недел|дедлайн|до\s+\d", text.lower()))


def evaluate_goal_heuristically(goal_text: str, metric: str | None = None, deadline: Any = None, priority: Any = None) -> Dict[str, Any]:
    text = (goal_text or "").strip()
    metric_text = (metric or "").strip()

    specific = 0.9 if len(text) >= 40 else 0.7 if len(text) >= 20 else 0.45
    measurable = 0.9 if metric_text or _contains_metric(text) else 0.35
    achievable = 0.8 if priority is None or int(priority) <= 4 else 0.6
    relevant = 0.82 if len(text.split()) >= 5 else 0.55
    time_bound = 0.9 if deadline or _contains_timeframe(text) else 0.35

    overall = round((specific + measurable + achievable + relevant + time_bound) / 5, 2)

    details = {
        "specific": {"score": round(specific, 2), "comment": "Эвристическая оценка", "is_satisfied": specific >= 0.7},
        "measurable": {"score": round(measurable, 2), "comment": "Эвристическая оценка", "is_satisfied": measurable >= 0.7},
        "achievable": {"score": round(achievable, 2), "comment": "Эвристическая оценка", "is_satisfied": achievable >= 0.7},
        "relevant": {"score": round(relevant, 2), "comment": "Эвристическая оценка", "is_satisfied": relevant >= 0.7},
        "time_bound": {"score": round(time_bound, 2), "comment": "Эвристическая оценка", "is_satisfied": time_bound >= 0.7},
    }

    return {
        "overall_score": overall,
        "smart_details": details,
    }
