"""
Goals API endpoints
Управление целями сотрудников и workflow согласования
"""
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models import (
    Employee,
    Goal,
    GoalEvent,
    GoalEventType,
    GoalReview,
    GoalStatus,
    ReviewVerdict,
)
from app.schemas.goal import (
    GoalAlertInfo,
    GoalCreate,
    GoalEventInfo,
    GoalListResponse,
    GoalResponse,
    GoalReviewInfo,
    GoalUpdate,
    GoalWorkflowActionRequest,
    GoalWorkflowActionResponse,
    GoalWorkflowResponse,
)
from app.services.alert_service import alert_service
from app.utils.goal_context import (
    goal_type_for_goal,
    load_generation_metadata,
    rationale_from_metadata,
    source_document_id_from_metadata,
    strategic_link_for_goal,
)
from app.utils.smart_heuristics import evaluate_goal_heuristically

router = APIRouter()


def _status_value(status) -> Optional[str]:
    if status is None:
        return None
    return status.value if hasattr(status, "value") else str(status)


def _goal_quarter_value(goal: Goal) -> Optional[str]:
    return goal.quarter.value if hasattr(goal.quarter, "value") else goal.quarter


def _goal_workflow_actions(goal: Goal) -> list[str]:
    status = _status_value(goal.status)
    if status in {"draft", "active"}:
        return ["submit", "comment"]
    if status == "submitted":
        return ["approve", "reject", "comment"]
    if status in {"approved", "in_progress", "done", "cancelled", "overdue", "archived"}:
        return ["comment"]
    return []


def _resolve_action_actor(db: Session, goal: Goal, actor_id: Optional[int], *, prefer_manager: bool = False) -> Optional[Employee]:
    resolved_actor_id = actor_id
    if resolved_actor_id is None:
        resolved_actor_id = goal.employee.manager_id if prefer_manager and goal.employee else goal.employee_id
    if resolved_actor_id is None:
        return None
    actor = db.query(Employee).filter(Employee.id == resolved_actor_id).first()
    if not actor:
        raise HTTPException(status_code=404, detail="Инициатор действия не найден")
    return actor


def _build_goal_alerts(goal: Goal, employee: Optional[Employee], metadata: Optional[dict]) -> list[GoalAlertInfo]:
    if not employee:
        return []
    return [
        GoalAlertInfo(
            alert_type=alert.alert_type,
            severity=alert.severity,
            title=alert.title,
            message=alert.message,
        )
        for alert in alert_service.build_goal_alerts(goal, employee, metadata)
    ]


def _serialize_goal(db: Session, goal: Goal, metadata: Optional[dict] = None) -> GoalResponse:
    employee = goal.employee
    heuristic = evaluate_goal_heuristically(
        goal.goal_text,
        metric=goal.metric,
        deadline=goal.deadline,
        priority=goal.priority,
    )

    return GoalResponse(
        id=str(goal.goal_id),
        employee_id=goal.employee_id,
        title=goal.goal_text,
        description=rationale_from_metadata(metadata),
        metric=goal.metric,
        deadline=goal.deadline,
        weight=float(goal.weight or 0),
        status=_status_value(goal.status),
        quarter=_goal_quarter_value(goal),
        year=goal.year,
        smart_score=heuristic["overall_score"],
        smart_details=heuristic["smart_details"],
        goal_type=goal_type_for_goal(goal, metadata),
        strategic_link=strategic_link_for_goal(goal, metadata),
        source_document_id=source_document_id_from_metadata(metadata),
        external_ref=goal.external_ref,
        created_at=goal.created_at,
        updated_at=goal.updated_at,
        employee_name=employee.full_name if employee else None,
        department_name=goal.department_name_snapshot or (employee.department.name if employee and employee.department else None),
        position_name=goal.position_snapshot or (employee.position.name if employee and employee.position else None),
        manager_id=employee.manager_id if employee else None,
        manager_name=employee.manager.full_name if employee and employee.manager else None,
        alerts=_build_goal_alerts(goal, employee, metadata),
    )


def _record_goal_event(
    db: Session,
    *,
    goal: Goal,
    event_type: GoalEventType,
    actor_id: Optional[int],
    old_status,
    new_status,
    old_text: Optional[str] = None,
    new_text: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> GoalEvent:
    event = GoalEvent(
        id=str(uuid4()),
        goal_id=str(goal.goal_id),
        event_type=event_type,
        actor_id=actor_id,
        old_status=old_status,
        new_status=new_status,
        old_text=old_text,
        new_text=new_text,
        event_metadata=metadata or {},
        created_at=datetime.now(timezone.utc),
    )
    db.add(event)
    return event


def _add_review(
    db: Session,
    *,
    goal: Goal,
    reviewer_id: Optional[int],
    verdict: ReviewVerdict,
    comment_text: str,
) -> GoalReview:
    review = GoalReview(
        id=str(uuid4()),
        goal_id=str(goal.goal_id),
        reviewer_id=reviewer_id,
        verdict=verdict,
        comment_text=comment_text,
        created_at=datetime.now(timezone.utc),
    )
    db.add(review)
    return review


def _serialize_workflow(goal: Goal) -> GoalWorkflowResponse:
    metadata = None
    # caller is responsible for passing an attached goal with loaded relations
    events = [
        GoalEventInfo(
            id=str(event.id),
            event_type=event.event_type.value if hasattr(event.event_type, "value") else str(event.event_type),
            actor_id=event.actor_id,
            actor_name=event.actor.full_name if event.actor else None,
            old_status=_status_value(event.old_status),
            new_status=_status_value(event.new_status),
            comment=(event.event_metadata or {}).get("comment"),
            created_at=event.created_at,
        )
        for event in sorted(goal.events, key=lambda item: item.created_at, reverse=True)
    ]
    reviews = [
        GoalReviewInfo(
            id=str(review.id),
            verdict=review.verdict.value if hasattr(review.verdict, "value") else str(review.verdict),
            reviewer_id=review.reviewer_id,
            reviewer_name=review.reviewer.full_name if review.reviewer else None,
            comment_text=review.comment_text,
            created_at=review.created_at,
        )
        for review in sorted(goal.reviews, key=lambda item: item.created_at, reverse=True)
    ]
    return GoalWorkflowResponse(
        goal=_serialize_goal(None, goal, metadata),  # type: ignore[arg-type]
        events=events,
        reviews=reviews,
        available_actions=_goal_workflow_actions(goal),
    )


def _load_goal_or_404(db: Session, goal_id: str) -> Goal:
    goal = db.query(Goal).filter(Goal.goal_id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Цель не найдена")
    return goal


@router.get("/", response_model=GoalListResponse)
async def get_goals(
    employee_id: Optional[int] = None,
    department_id: Optional[int] = None,
    quarter: Optional[str] = None,
    year: Optional[int] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """
    Получить список целей с фильтрацией
    """
    query = db.query(Goal)

    if employee_id:
        query = query.filter(Goal.employee_id == employee_id)
    if department_id:
        query = query.join(Employee).filter(Employee.department_id == department_id)
    if quarter:
        query = query.filter(Goal.quarter == quarter)
    if year:
        query = query.filter(Goal.year == year)
    if status:
        query = query.filter(Goal.status == status)

    total = query.count()
    goals = query.order_by(Goal.updated_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    generation_metadata = load_generation_metadata(db, [goal.goal_id for goal in goals])
    goal_responses = [
        _serialize_goal(db, goal, generation_metadata.get(str(goal.goal_id)))
        for goal in goals
    ]

    return GoalListResponse(goals=goal_responses, total=total, page=page, per_page=per_page)


@router.get("/{goal_id}", response_model=GoalResponse)
async def get_goal(goal_id: str, db: Session = Depends(get_db)):
    goal = _load_goal_or_404(db, goal_id)
    metadata = load_generation_metadata(db, [goal.goal_id]).get(str(goal.goal_id))
    return _serialize_goal(db, goal, metadata)


@router.get("/{goal_id}/workflow", response_model=GoalWorkflowResponse)
async def get_goal_workflow(goal_id: str, db: Session = Depends(get_db)):
    goal = _load_goal_or_404(db, goal_id)
    metadata = load_generation_metadata(db, [goal.goal_id]).get(str(goal.goal_id))
    events = [
        GoalEventInfo(
            id=str(event.id),
            event_type=event.event_type.value if hasattr(event.event_type, "value") else str(event.event_type),
            actor_id=event.actor_id,
            actor_name=event.actor.full_name if event.actor else None,
            old_status=_status_value(event.old_status),
            new_status=_status_value(event.new_status),
            comment=(event.event_metadata or {}).get("comment"),
            created_at=event.created_at,
        )
        for event in sorted(goal.events, key=lambda item: item.created_at, reverse=True)
    ]
    reviews = [
        GoalReviewInfo(
            id=str(review.id),
            verdict=review.verdict.value if hasattr(review.verdict, "value") else str(review.verdict),
            reviewer_id=review.reviewer_id,
            reviewer_name=review.reviewer.full_name if review.reviewer else None,
            comment_text=review.comment_text,
            created_at=review.created_at,
        )
        for review in sorted(goal.reviews, key=lambda item: item.created_at, reverse=True)
    ]
    return GoalWorkflowResponse(
        goal=_serialize_goal(db, goal, metadata),
        events=events,
        reviews=reviews,
        available_actions=_goal_workflow_actions(goal),
    )


@router.post("/", response_model=GoalResponse)
async def create_goal(goal_data: GoalCreate, db: Session = Depends(get_db)):
    employee = db.query(Employee).filter(Employee.id == goal_data.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    now = datetime.now(timezone.utc)
    goal = Goal(
        goal_id=str(uuid4()),
        employee_id=goal_data.employee_id,
        department_id=employee.department_id,
        employee_name_snapshot=employee.full_name,
        position_snapshot=employee.position.name if employee.position else None,
        department_name_snapshot=employee.department.name if employee.department else None,
        goal_text=goal_data.title,
        metric=goal_data.metric,
        deadline=goal_data.deadline,
        weight=goal_data.weight,
        quarter=goal_data.quarter,
        year=goal_data.year,
        status=GoalStatus.DRAFT,
        created_at=now,
        updated_at=now,
    )

    db.add(goal)
    _record_goal_event(
        db,
        goal=goal,
        event_type=GoalEventType.CREATED,
        actor_id=employee.id,
        old_status=None,
        new_status=GoalStatus.DRAFT,
        new_text=goal.goal_text,
        metadata={"creation_source": "manual"},
    )

    db.commit()
    db.refresh(goal)
    return _serialize_goal(db, goal, None)


@router.put("/{goal_id}", response_model=GoalResponse)
async def update_goal(goal_id: str, goal_data: GoalUpdate, db: Session = Depends(get_db)):
    goal = _load_goal_or_404(db, goal_id)

    old_text = goal.goal_text
    update_data = goal_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "title":
            goal.goal_text = value
        else:
            setattr(goal, field, value)

    goal.updated_at = datetime.now(timezone.utc)
    _record_goal_event(
        db,
        goal=goal,
        event_type=GoalEventType.EDITED,
        actor_id=goal.employee_id,
        old_status=goal.status,
        new_status=goal.status,
        old_text=old_text,
        new_text=goal.goal_text,
        metadata={"comment": "Цель обновлена вручную"},
    )

    db.commit()
    db.refresh(goal)
    metadata = load_generation_metadata(db, [goal.goal_id]).get(str(goal.goal_id))
    return _serialize_goal(db, goal, metadata)


@router.post("/{goal_id}/submit", response_model=GoalWorkflowActionResponse)
async def submit_goal(goal_id: str, request: GoalWorkflowActionRequest, db: Session = Depends(get_db)):
    goal = _load_goal_or_404(db, goal_id)
    if _status_value(goal.status) not in {"draft", "active"}:
        raise HTTPException(status_code=400, detail="Отправить можно только цель в статусе draft или active")

    actor = _resolve_action_actor(db, goal, request.actor_id, prefer_manager=False)
    old_status = goal.status
    goal.status = GoalStatus.SUBMITTED
    goal.updated_at = datetime.now(timezone.utc)

    _record_goal_event(
        db,
        goal=goal,
        event_type=GoalEventType.SUBMITTED,
        actor_id=actor.id if actor else None,
        old_status=old_status,
        new_status=GoalStatus.SUBMITTED,
        metadata={"comment": request.comment or "Цель отправлена на согласование"},
    )

    db.commit()
    db.refresh(goal)
    metadata = load_generation_metadata(db, [goal.goal_id]).get(str(goal.goal_id))
    return GoalWorkflowActionResponse(
        message="Цель отправлена на согласование",
        goal=_serialize_goal(db, goal, metadata),
        available_actions=_goal_workflow_actions(goal),
    )


@router.post("/{goal_id}/approve", response_model=GoalWorkflowActionResponse)
async def approve_goal(goal_id: str, request: GoalWorkflowActionRequest, db: Session = Depends(get_db)):
    goal = _load_goal_or_404(db, goal_id)
    if _status_value(goal.status) != "submitted":
        raise HTTPException(status_code=400, detail="Утверждать можно только цель в статусе submitted")

    reviewer = _resolve_action_actor(db, goal, request.actor_id, prefer_manager=True)
    old_status = goal.status
    goal.status = GoalStatus.APPROVED
    goal.updated_at = datetime.now(timezone.utc)

    comment_text = request.comment or "Цель утверждена руководителем"
    _add_review(db, goal=goal, reviewer_id=reviewer.id if reviewer else None, verdict=ReviewVerdict.APPROVE, comment_text=comment_text)
    _record_goal_event(
        db,
        goal=goal,
        event_type=GoalEventType.APPROVED,
        actor_id=reviewer.id if reviewer else None,
        old_status=old_status,
        new_status=GoalStatus.APPROVED,
        metadata={"comment": comment_text},
    )

    db.commit()
    db.refresh(goal)
    metadata = load_generation_metadata(db, [goal.goal_id]).get(str(goal.goal_id))
    return GoalWorkflowActionResponse(
        message="Цель утверждена",
        goal=_serialize_goal(db, goal, metadata),
        available_actions=_goal_workflow_actions(goal),
    )


@router.post("/{goal_id}/reject", response_model=GoalWorkflowActionResponse)
async def reject_goal(goal_id: str, request: GoalWorkflowActionRequest, db: Session = Depends(get_db)):
    goal = _load_goal_or_404(db, goal_id)
    if _status_value(goal.status) != "submitted":
        raise HTTPException(status_code=400, detail="Вернуть на доработку можно только цель в статусе submitted")

    reviewer = _resolve_action_actor(db, goal, request.actor_id, prefer_manager=True)
    old_status = goal.status
    goal.status = GoalStatus.DRAFT
    goal.updated_at = datetime.now(timezone.utc)

    comment_text = request.comment or "Цель возвращена на доработку"
    _add_review(db, goal=goal, reviewer_id=reviewer.id if reviewer else None, verdict=ReviewVerdict.NEEDS_CHANGES, comment_text=comment_text)
    _record_goal_event(
        db,
        goal=goal,
        event_type=GoalEventType.REJECTED,
        actor_id=reviewer.id if reviewer else None,
        old_status=old_status,
        new_status=GoalStatus.DRAFT,
        metadata={"comment": comment_text},
    )

    db.commit()
    db.refresh(goal)
    metadata = load_generation_metadata(db, [goal.goal_id]).get(str(goal.goal_id))
    return GoalWorkflowActionResponse(
        message="Цель возвращена на доработку",
        goal=_serialize_goal(db, goal, metadata),
        available_actions=_goal_workflow_actions(goal),
    )


@router.post("/{goal_id}/comment", response_model=GoalWorkflowActionResponse)
async def comment_goal(goal_id: str, request: GoalWorkflowActionRequest, db: Session = Depends(get_db)):
    goal = _load_goal_or_404(db, goal_id)
    if not request.comment or not request.comment.strip():
        raise HTTPException(status_code=400, detail="Для комментария требуется текст")

    actor = _resolve_action_actor(db, goal, request.actor_id, prefer_manager=True)
    comment_text = request.comment.strip()
    _add_review(db, goal=goal, reviewer_id=actor.id if actor else None, verdict=ReviewVerdict.COMMENT_ONLY, comment_text=comment_text)
    _record_goal_event(
        db,
        goal=goal,
        event_type=GoalEventType.COMMENTED,
        actor_id=actor.id if actor else None,
        old_status=goal.status,
        new_status=goal.status,
        metadata={"comment": comment_text},
    )
    goal.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(goal)
    metadata = load_generation_metadata(db, [goal.goal_id]).get(str(goal.goal_id))
    return GoalWorkflowActionResponse(
        message="Комментарий добавлен",
        goal=_serialize_goal(db, goal, metadata),
        available_actions=_goal_workflow_actions(goal),
    )


@router.delete("/{goal_id}")
async def delete_goal(goal_id: str, db: Session = Depends(get_db)):
    goal = _load_goal_or_404(db, goal_id)
    db.query(GoalReview).filter(GoalReview.goal_id == goal_id).delete(synchronize_session=False)
    db.query(GoalEvent).filter(GoalEvent.goal_id == goal_id).delete(synchronize_session=False)
    db.delete(goal)
    db.commit()
    return {"message": "Цель удалена"}
