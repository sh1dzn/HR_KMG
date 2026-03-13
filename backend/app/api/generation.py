"""
Generation API endpoints
Генерация целей на основе ВНД и стратегии
"""
import asyncio
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models import Department, Employee, Goal, GoalEvent, GoalEventType, Document, GoalStatus
from app.schemas.generation import (
    AcceptedGeneratedGoalsRequest,
    AcceptedGeneratedGoalsResponse,
    DocumentIndexStatusResponse,
    DocumentReindexResponse,
    GenerationRequest,
    GenerationResponse,
    GeneratedGoal,
    HistoricalCheck,
)
from app.services.goal_generator import goal_generator
from app.services.rag_service import rag_service
from app.utils.document_scope import department_matches_scope, resolve_department_scope_labels
from app.utils.text_processing import normalize_goal_text
from app.utils.smart_heuristics import evaluate_goal_heuristically

router = APIRouter()

_QUARTER_ORDER = {
    "Q1": 1,
    "Q2": 2,
    "Q3": 3,
    "Q4": 4,
}


def _persist_generated_goals(
    db: Session,
    employee: Employee,
    *,
    employee_id: int,
    quarter: str,
    year: int,
    generated_goals: list[GeneratedGoal],
    generation_context: str = "",
    cascaded_from_manager: bool = False,
    manager_name: Optional[str] = None,
    manager_goals_used: Optional[list[str]] = None,
) -> list[Goal]:
    now = datetime.now(timezone.utc)
    saved_goals: list[Goal] = []
    manager_goals_used = manager_goals_used or []

    for generated_goal in generated_goals:
        goal_id = str(uuid4())
        goal = Goal(
            goal_id=goal_id,
            employee_id=employee_id,
            department_id=employee.department_id,
            employee_name_snapshot=employee.full_name,
            position_snapshot=employee.position.name if employee.position else None,
            department_name_snapshot=employee.department.name if employee.department else None,
            goal_text=generated_goal.goal_text,
            metric=generated_goal.metric,
            weight=generated_goal.suggested_weight,
            quarter=quarter,
            year=year,
            status=GoalStatus.DRAFT,
            created_at=now,
            updated_at=now,
        )
        event = GoalEvent(
            id=str(uuid4()),
            goal_id=goal_id,
            event_type=GoalEventType.CREATED,
            actor_id=employee_id,
            new_status=GoalStatus.DRAFT,
            new_text=generated_goal.goal_text,
            event_metadata={
                "creation_source": "ai_generation",
                "generation_context": generation_context,
                "cascaded_from_manager": cascaded_from_manager,
                "manager_name": manager_name,
                "manager_goals_used": manager_goals_used,
                "smart_score": generated_goal.smart_score,
                "goal_type": generated_goal.goal_type,
                "goal_type_russian": generated_goal.goal_type_russian,
                "strategic_link": generated_goal.strategic_link,
                "strategic_link_russian": generated_goal.strategic_link_russian,
                "rationale": generated_goal.rationale,
                "suggested_weight": generated_goal.suggested_weight,
                "source_document": generated_goal.source_document.model_dump(),
            },
            created_at=now,
        )

        db.add(goal)
        db.add(event)
        saved_goals.append(goal)

    db.commit()

    for goal in saved_goals:
        db.refresh(goal)

    return saved_goals


def _load_existing_goal_texts(
    db: Session,
    *,
    employee_id: int,
    quarter: str,
    year: int,
) -> set[str]:
    existing_goals = db.query(Goal.goal_text).filter(
        Goal.employee_id == employee_id,
        Goal.quarter == quarter,
        Goal.year == year,
    ).all()
    return {
        normalize_goal_text(goal_text)
        for goal_text, in existing_goals
        if goal_text
    }


def _filter_duplicate_generated_goals(
    generated_goals: list[GeneratedGoal],
    *,
    existing_goal_texts: set[str],
) -> tuple[list[GeneratedGoal], list[str]]:
    unique_goals: list[GeneratedGoal] = []
    skipped_duplicates: list[str] = []
    seen_in_request: set[str] = set()

    for generated_goal in generated_goals:
        normalized_goal_text = normalize_goal_text(generated_goal.goal_text)
        if not normalized_goal_text:
            continue
        if normalized_goal_text in existing_goal_texts or normalized_goal_text in seen_in_request:
            skipped_duplicates.append(generated_goal.goal_text)
            continue
        seen_in_request.add(normalized_goal_text)
        unique_goals.append(generated_goal)

    return unique_goals, skipped_duplicates


def _goal_quarter_value(goal: Goal) -> Optional[str]:
    return goal.quarter.value if hasattr(goal.quarter, "value") else goal.quarter


def _goal_status_value(goal: Goal) -> Optional[str]:
    return goal.status.value if hasattr(goal.status, "value") else goal.status


def _is_past_goal(goal: Goal, quarter: str, year: int) -> bool:
    current_period = (year, _QUARTER_ORDER.get(quarter, 0))
    goal_period = (goal.year or 0, _QUARTER_ORDER.get(_goal_quarter_value(goal) or "", 0))
    return goal_period < current_period


def _build_historical_check(db: Session, employee: Employee, quarter: str, year: int) -> HistoricalCheck:
    department_goals = db.query(Goal).filter(Goal.department_id == employee.department_id).all()
    past_department_goals = [goal for goal in department_goals if _is_past_goal(goal, quarter, year)]
    past_employee_goals = [goal for goal in past_department_goals if goal.employee_id == employee.id]

    reference_goals = past_employee_goals or past_department_goals
    basis = "employee_history" if past_employee_goals else "department_benchmark" if past_department_goals else "none"

    total_reference_goals = len(reference_goals)
    completed_count = sum(1 for goal in reference_goals if _goal_status_value(goal) == GoalStatus.DONE.value)
    employee_completed = sum(1 for goal in past_employee_goals if _goal_status_value(goal) == GoalStatus.DONE.value)
    department_completed = sum(1 for goal in past_department_goals if _goal_status_value(goal) == GoalStatus.DONE.value)

    smart_scores = [
        evaluate_goal_heuristically(goal.goal_text, goal.metric, goal.deadline, goal.priority)["overall_score"]
        for goal in reference_goals
    ]
    avg_smart = sum(smart_scores) / len(smart_scores) if smart_scores else None

    completion_rate = (completed_count / total_reference_goals * 100) if total_reference_goals > 0 else 0
    employee_completion_rate = (
        round(employee_completed / len(past_employee_goals) * 100, 1)
        if past_employee_goals else None
    )
    department_completion_rate = (
        round(department_completed / len(past_department_goals) * 100, 1)
        if past_department_goals else None
    )

    on_time_completed = sum(
        1
        for goal in reference_goals
        if _goal_status_value(goal) == GoalStatus.DONE.value
        and goal.deadline
        and goal.updated_at
        and goal.updated_at.date() <= goal.deadline
    )
    on_time_completion_rate = (
        round(on_time_completed / completed_count * 100, 1)
        if completed_count else None
    )

    if basis == "none":
        assessment = "Нет исторических данных для оценки достижимости."
    elif basis == "employee_history":
        if completion_rate >= 75 and (avg_smart or 0) >= 0.75:
            assessment = "Высокая достижимость по личной истории сотрудника."
        elif completion_rate >= 55:
            assessment = "Сбалансированная достижимость по личной истории сотрудника."
        else:
            assessment = "По личной истории сотрудника цели стоит делать более реалистичными."
    else:
        if completion_rate >= 70:
            assessment = "Личной истории недостаточно; использован сильный бенчмарк подразделения."
        elif completion_rate >= 45:
            assessment = "Личной истории недостаточно; использован умеренный бенчмарк подразделения."
        else:
            assessment = "Личной истории недостаточно; бенчмарк подразделения указывает на повышенный риск."

    if on_time_completion_rate is not None and on_time_completion_rate < 60:
        assessment += " В истории есть риск срыва сроков."

    return HistoricalCheck(
        total_past_goals=total_reference_goals,
        completed_count=completed_count,
        completion_rate=round(completion_rate, 1),
        avg_smart_score=round(avg_smart, 2) if avg_smart is not None else None,
        basis=basis,
        employee_past_goals=len(past_employee_goals),
        department_past_goals=len(past_department_goals),
        employee_completion_rate=employee_completion_rate,
        department_completion_rate=department_completion_rate,
        on_time_completion_rate=on_time_completion_rate,
        assessment=assessment,
    )


@router.post("/generate", response_model=GenerationResponse)
async def generate_goals(
    request: GenerationRequest,
    db: Session = Depends(get_db)
):
    """
    Сгенерировать цели для сотрудника

    На основе ВНД, стратегических документов, должности и подразделения
    генерирует 3-5 целей в формате SMART с привязкой к источникам.

    Параметры:
    - **employee_id**: ID сотрудника
    - **quarter**: Квартал (Q1-Q4)
    - **year**: Год
    - **focus_areas**: Фокус-направления (опционально)
    - **manager_goals**: Цели руководителя для каскадирования (опционально)
    - **count**: Количество целей (1-5, по умолчанию 3)
    """
    # Get employee
    employee = db.query(Employee).filter(Employee.id == request.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    # Get position and department
    position = request.position or (employee.position.name if employee.position else "Специалист")
    department = request.department or (employee.department.name if employee.department else "Общий отдел")

    # Get manager goals if cascading requested and not provided
    manager_goals = request.manager_goals
    cascaded_from_manager = False
    manager_name = None
    manager_goals_used = []
    if not manager_goals and employee.manager_id:
        manager = db.query(Employee).filter(Employee.id == employee.manager_id).first()
        if manager:
            manager_goal_objects = db.query(Goal).filter(
                Goal.employee_id == manager.id,
                Goal.quarter == request.quarter,
                Goal.year == request.year
            ).all()
            manager_goals = [g.goal_text for g in manager_goal_objects]
            if manager_goals:
                cascaded_from_manager = True
                manager_name = manager.full_name
                manager_goals_used = manager_goals

    historical_check = _build_historical_check(db, employee, request.quarter, request.year)

    # Generate goals
    response = await goal_generator.generate_goals(
        employee_id=employee.id,
        employee_name=employee.full_name,
        position=position,
        department=department,
        quarter=request.quarter,
        year=request.year,
        focus_areas=request.focus_areas,
        manager_goals=manager_goals,
        count=request.count
    )

    response.cascaded_from_manager = cascaded_from_manager
    response.manager_name = manager_name
    response.manager_goals_used = manager_goals_used
    response.historical_check = historical_check

    return response


@router.post("/generate-and-save")
async def generate_and_save_goals(
    request: GenerationRequest,
    db: Session = Depends(get_db)
):
    """
    Сгенерировать и сохранить цели в базу данных

    Генерирует цели и создает их как черновики в системе
    """
    # Generate goals
    response = await generate_goals(request, db)
    employee = db.query(Employee).filter(Employee.id == request.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    existing_goal_texts = _load_existing_goal_texts(
        db,
        employee_id=request.employee_id,
        quarter=request.quarter,
        year=request.year,
    )
    goals_to_save, skipped_duplicates = _filter_duplicate_generated_goals(
        response.generated_goals,
        existing_goal_texts=existing_goal_texts,
    )

    saved_goals = _persist_generated_goals(
        db,
        employee,
        employee_id=request.employee_id,
        quarter=request.quarter,
        year=request.year,
        generated_goals=goals_to_save,
        generation_context=response.generation_context,
        cascaded_from_manager=response.cascaded_from_manager,
        manager_name=response.manager_name,
        manager_goals_used=response.manager_goals_used,
    )

    return {
        "message": f"Создано {len(saved_goals)} целей",
        "saved_count": len(saved_goals),
        "goal_ids": [str(g.goal_id) for g in saved_goals],
        "generated_goals": goals_to_save,
        "skipped_duplicates": skipped_duplicates,
    }


@router.post("/save-accepted", response_model=AcceptedGeneratedGoalsResponse)
async def save_accepted_generated_goals(
    request: AcceptedGeneratedGoalsRequest,
    db: Session = Depends(get_db)
):
    """Сохранить принятые пользователем AI-сгенерированные цели."""
    employee = db.query(Employee).filter(Employee.id == request.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    existing_goal_texts = _load_existing_goal_texts(
        db,
        employee_id=request.employee_id,
        quarter=request.quarter,
        year=request.year,
    )
    goals_to_save, skipped_duplicates = _filter_duplicate_generated_goals(
        request.accepted_goals,
        existing_goal_texts=existing_goal_texts,
    )

    saved_goals = _persist_generated_goals(
        db,
        employee,
        employee_id=request.employee_id,
        quarter=request.quarter,
        year=request.year,
        generated_goals=goals_to_save,
        generation_context=request.generation_context,
        cascaded_from_manager=request.cascaded_from_manager,
        manager_name=request.manager_name,
        manager_goals_used=request.manager_goals_used,
    )

    message = (
        f"Сохранено {len(saved_goals)} целей"
        if saved_goals
        else "Все выбранные цели уже существуют в указанном периоде"
    )

    return AcceptedGeneratedGoalsResponse(
        message=message,
        saved_count=len(saved_goals),
        goal_ids=[str(goal.goal_id) for goal in saved_goals],
        saved_goal_texts=[goal.goal_text for goal in saved_goals],
        skipped_duplicates=skipped_duplicates,
    )


@router.get("/documents")
async def get_available_documents(
    department: Optional[str] = None,
    doc_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Получить список доступных ВНД документов

    Возвращает документы, которые используются для генерации целей
    """
    query = db.query(Document).filter(Document.is_active == True)

    department_rows = db.query(Department).all()
    department_names_by_id = {department.id: department.name for department in department_rows}
    department_codes_by_id = {
        department.id: department.code
        for department in department_rows
        if department.code
    }

    if doc_type:
        query = query.filter(Document.doc_type == doc_type)

    documents = []
    for doc in query.all():
        owner_department = doc.owner_department
        scope_values = resolve_department_scope_labels(
            doc.department_scope,
            department_names_by_id=department_names_by_id,
            department_codes_by_id=department_codes_by_id,
        )
        if not department_matches_scope(
            department,
            scope_values,
            owner_department_name=owner_department.name if owner_department else None,
            owner_department_code=owner_department.code if owner_department else None,
        ):
            continue
        documents.append((doc, scope_values))

    return {
        "total": len(documents),
        "documents": [
            {
                "doc_id": str(doc.doc_id),
                "title": doc.title,
                "doc_type": doc.doc_type.value if doc.doc_type else None,
                "keywords": doc.get_keywords_list(),
                "department_scope": scope_values,
                "valid_from": doc.valid_from,
                "valid_to": doc.valid_to
            }
            for doc, scope_values in documents
        ]
    }


@router.get("/index-status", response_model=DocumentIndexStatusResponse)
async def get_document_index_status():
    status = await asyncio.to_thread(rag_service.get_index_status)
    return DocumentIndexStatusResponse(**status)


@router.post("/reindex-documents", response_model=DocumentReindexResponse)
async def reindex_documents():
    indexed_documents = await asyncio.to_thread(rag_service.ensure_collection_populated, True)
    status = await asyncio.to_thread(rag_service.get_index_status)
    message = (
        f"Переиндексировано {indexed_documents} документов"
        if indexed_documents
        else "Векторный индекс не обновлен; доступен lexical fallback по документам"
    )
    return DocumentReindexResponse(
        message=message,
        indexed_documents=indexed_documents,
        indexed_chunks=status["indexed_chunks"],
        search_mode=status["search_mode"],
    )


@router.get("/focus-areas")
async def get_focus_areas():
    """
    Получить список типовых фокус-направлений

    Возвращает предопределенные направления для генерации целей
    """
    return {
        "focus_areas": [
            {
                "id": "digitalization",
                "name": "Цифровизация",
                "description": "Внедрение цифровых технологий и автоматизация процессов"
            },
            {
                "id": "cost_reduction",
                "name": "Снижение затрат",
                "description": "Оптимизация расходов и повышение эффективности"
            },
            {
                "id": "quality",
                "name": "Повышение качества",
                "description": "Улучшение качества продукции и услуг"
            },
            {
                "id": "safety",
                "name": "Безопасность",
                "description": "Промышленная безопасность и охрана труда"
            },
            {
                "id": "sustainability",
                "name": "Устойчивое развитие",
                "description": "ESG и экологические инициативы"
            },
            {
                "id": "innovation",
                "name": "Инновации",
                "description": "Разработка и внедрение новых решений"
            },
            {
                "id": "customer_focus",
                "name": "Клиентоориентированность",
                "description": "Улучшение клиентского опыта и сервиса"
            },
            {
                "id": "talent_development",
                "name": "Развитие персонала",
                "description": "Обучение и развитие сотрудников"
            }
        ]
    }
