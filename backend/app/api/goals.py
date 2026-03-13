"""
Goals API endpoints
Управление целями сотрудников
"""
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models import Goal, Employee, GoalStatus
from app.schemas.goal import GoalCreate, GoalUpdate, GoalResponse, GoalListResponse
from app.utils.smart_heuristics import evaluate_goal_heuristically

router = APIRouter()


@router.get("/", response_model=GoalListResponse)
async def get_goals(
    employee_id: Optional[int] = None,
    department_id: Optional[int] = None,
    quarter: Optional[str] = None,
    year: Optional[int] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Получить список целей с фильтрацией

    - **employee_id**: Фильтр по сотруднику
    - **department_id**: Фильтр по подразделению
    - **quarter**: Фильтр по кварталу (Q1-Q4)
    - **year**: Фильтр по году
    - **status**: Фильтр по статусу
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

    goals = query.offset((page - 1) * per_page).limit(per_page).all()

    # Enrich with related data
    goal_responses = []
    for goal in goals:
        employee = goal.employee
        heuristic = evaluate_goal_heuristically(
            goal.goal_text,
            metric=goal.metric,
            deadline=goal.deadline,
            priority=goal.priority,
        )
        goal_dict = {
            "id": str(goal.goal_id),
            "employee_id": goal.employee_id,
            "title": goal.goal_text,
            "description": None,
            "metric": goal.metric,
            "deadline": goal.deadline,
            "weight": float(goal.weight or 0),
            "status": goal.status.value if hasattr(goal.status, "value") else goal.status,
            "quarter": goal.quarter.value if hasattr(goal.quarter, "value") else goal.quarter,
            "year": goal.year,
            "smart_score": heuristic["overall_score"],
            "smart_details": heuristic["smart_details"],
            "goal_type": "project" if goal.project_id else "system" if goal.system_id else "functional",
            "strategic_link": "strategic" if goal.project_id else "functional" if goal.system_id else "operational",
            "source_document_id": None,
            "created_at": goal.created_at,
            "updated_at": goal.updated_at,
            "employee_name": employee.full_name if employee else None,
            "department_name": goal.department_name_snapshot or (employee.department.name if employee and employee.department else None),
            "position_name": goal.position_snapshot or (employee.position.name if employee and employee.position else None),
        }
        goal_responses.append(GoalResponse(**goal_dict))

    return GoalListResponse(
        goals=goal_responses,
        total=total,
        page=page,
        per_page=per_page
    )


@router.get("/{goal_id}", response_model=GoalResponse)
async def get_goal(goal_id: str, db: Session = Depends(get_db)):
    """Получить цель по ID"""
    goal = db.query(Goal).filter(Goal.goal_id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Цель не найдена")

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
        description=None,
        metric=goal.metric,
        deadline=goal.deadline,
        weight=float(goal.weight or 0),
        status=goal.status.value if hasattr(goal.status, "value") else goal.status,
        quarter=goal.quarter.value if hasattr(goal.quarter, "value") else goal.quarter,
        year=goal.year,
        smart_score=heuristic["overall_score"],
        smart_details=heuristic["smart_details"],
        goal_type="project" if goal.project_id else "system" if goal.system_id else "functional",
        strategic_link="strategic" if goal.project_id else "functional" if goal.system_id else "operational",
        source_document_id=None,
        created_at=goal.created_at,
        updated_at=goal.updated_at,
        employee_name=employee.full_name if employee else None,
        department_name=goal.department_name_snapshot or (employee.department.name if employee and employee.department else None),
        position_name=goal.position_snapshot or (employee.position.name if employee and employee.position else None),
    )


@router.post("/", response_model=GoalResponse)
async def create_goal(goal_data: GoalCreate, db: Session = Depends(get_db)):
    """Создать новую цель"""
    # Verify employee exists
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
    db.commit()
    db.refresh(goal)
    heuristic = evaluate_goal_heuristically(goal.goal_text, goal.metric, goal.deadline, goal.priority)

    return GoalResponse(
        id=str(goal.goal_id),
        employee_id=goal.employee_id,
        title=goal.goal_text,
        description=None,
        metric=goal.metric,
        deadline=goal.deadline,
        weight=float(goal.weight or 0),
        status=goal.status.value if hasattr(goal.status, "value") else goal.status,
        quarter=goal.quarter.value if hasattr(goal.quarter, "value") else goal.quarter,
        year=goal.year,
        smart_score=heuristic["overall_score"],
        smart_details=heuristic["smart_details"],
        goal_type="functional",
        strategic_link="operational",
        source_document_id=None,
        created_at=goal.created_at,
        updated_at=goal.updated_at,
        employee_name=employee.full_name,
        department_name=employee.department.name if employee.department else None,
        position_name=employee.position.name if employee.position else None,
    )


@router.put("/{goal_id}", response_model=GoalResponse)
async def update_goal(goal_id: str, goal_data: GoalUpdate, db: Session = Depends(get_db)):
    """Обновить цель"""
    goal = db.query(Goal).filter(Goal.goal_id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Цель не найдена")

    update_data = goal_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "title":
            goal.goal_text = value
        else:
            setattr(goal, field, value)

    goal.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(goal)

    heuristic = evaluate_goal_heuristically(
        goal.goal_text,
        metric=goal.metric,
        deadline=goal.deadline,
        priority=goal.priority,
    )
    employee = goal.employee
    return GoalResponse(
        id=str(goal.goal_id),
        employee_id=goal.employee_id,
        title=goal.goal_text,
        description=None,
        metric=goal.metric,
        deadline=goal.deadline,
        weight=float(goal.weight or 0),
        status=goal.status.value if hasattr(goal.status, "value") else goal.status,
        quarter=goal.quarter.value if hasattr(goal.quarter, "value") else goal.quarter,
        year=goal.year,
        smart_score=heuristic["overall_score"],
        smart_details=heuristic["smart_details"],
        goal_type="project" if goal.project_id else "system" if goal.system_id else "functional",
        strategic_link="strategic" if goal.project_id else "functional" if goal.system_id else "operational",
        source_document_id=None,
        created_at=goal.created_at,
        updated_at=goal.updated_at,
        employee_name=employee.full_name if employee else None,
        department_name=goal.department_name_snapshot or (employee.department.name if employee and employee.department else None),
        position_name=goal.position_snapshot or (employee.position.name if employee and employee.position else None),
    )


@router.delete("/{goal_id}")
async def delete_goal(goal_id: str, db: Session = Depends(get_db)):
    """Удалить цель"""
    goal = db.query(Goal).filter(Goal.goal_id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Цель не найдена")

    db.delete(goal)
    db.commit()

    return {"message": "Цель успешно удалена", "goal_id": goal_id}
