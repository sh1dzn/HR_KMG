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
