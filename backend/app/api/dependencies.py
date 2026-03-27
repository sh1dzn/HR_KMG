"""Dependency graph endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

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
