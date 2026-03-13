"""
Helpers for loading AI-generated goal context stored in goal_events metadata.
"""
from typing import Dict, Iterable, Optional

from sqlalchemy.orm import Session

from app.models import Goal, GoalEvent, GoalEventType


def load_generation_metadata(db: Session, goal_ids: Iterable[str]) -> Dict[str, dict]:
    """Load the latest AI-generation metadata for a set of goals."""
    normalized_ids = [str(goal_id) for goal_id in goal_ids if goal_id]
    if not normalized_ids:
        return {}

    events = (
        db.query(GoalEvent)
        .filter(
            GoalEvent.goal_id.in_(normalized_ids),
            GoalEvent.event_type == GoalEventType.CREATED,
        )
        .order_by(GoalEvent.created_at.desc())
        .all()
    )

    metadata_by_goal: Dict[str, dict] = {}
    for event in events:
        goal_id = str(event.goal_id)
        if goal_id in metadata_by_goal:
            continue

        metadata = event.event_metadata or {}
        if metadata.get("creation_source") != "ai_generation":
            continue

        metadata_by_goal[goal_id] = metadata

    return metadata_by_goal


def goal_type_for_goal(goal: Goal, metadata: Optional[dict] = None) -> str:
    if metadata and metadata.get("goal_type"):
        return str(metadata["goal_type"])
    if goal.project_id:
        return "impact"
    if goal.system_id:
        return "output"
    return "activity"


def strategic_link_for_goal(goal: Goal, metadata: Optional[dict] = None) -> str:
    if metadata and metadata.get("strategic_link"):
        return str(metadata["strategic_link"])
    if goal.project_id:
        return "strategic"
    if goal.system_id:
        return "functional"
    return "operational"


def rationale_from_metadata(metadata: Optional[dict]) -> Optional[str]:
    if not metadata:
        return None
    return metadata.get("rationale")


def source_document_id_from_metadata(metadata: Optional[dict]) -> Optional[str]:
    if not metadata:
        return None
    source_document = metadata.get("source_document") or {}
    doc_id = source_document.get("doc_id")
    return str(doc_id) if doc_id else None
