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
