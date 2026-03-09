"""
Generation API endpoints
Генерация целей на основе ВНД и стратегии
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import Employee, Goal, Document, GoalStatus
from app.schemas.generation import GenerationRequest, GenerationResponse
from app.services.goal_generator import goal_generator

router = APIRouter()


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
    if not manager_goals and employee.manager_id:
        manager = db.query(Employee).filter(Employee.id == employee.manager_id).first()
        if manager:
            manager_goal_objects = db.query(Goal).filter(
                Goal.employee_id == manager.id,
                Goal.quarter == request.quarter,
                Goal.year == request.year
            ).all()
            manager_goals = [g.title for g in manager_goal_objects]

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

    # Save goals to database
    saved_goals = []
    for gen_goal in response.generated_goals:
        goal = Goal(
            employee_id=request.employee_id,
            title=gen_goal.goal_text,
            metric=gen_goal.metric,
            weight=gen_goal.suggested_weight,
            quarter=request.quarter,
            year=request.year,
            status=GoalStatus.DRAFT,
            smart_score=gen_goal.smart_score,
            goal_type=gen_goal.goal_type,
            strategic_link=gen_goal.strategic_link,
            source_document_id=gen_goal.source_document.doc_id if gen_goal.source_document.doc_id > 0 else None
        )
        db.add(goal)
        saved_goals.append(goal)

    db.commit()

    # Refresh to get IDs
    for goal in saved_goals:
        db.refresh(goal)

    return {
        "message": f"Создано {len(saved_goals)} целей",
        "goal_ids": [g.id for g in saved_goals],
        "generated_goals": response.generated_goals
    }


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

    if department:
        query = query.filter(Document.department_scope.contains(department))
    if doc_type:
        query = query.filter(Document.doc_type == doc_type)

    documents = query.all()

    return {
        "total": len(documents),
        "documents": [
            {
                "doc_id": doc.doc_id,
                "title": doc.title,
                "doc_type": doc.doc_type.value if doc.doc_type else None,
                "keywords": doc.get_keywords_list(),
                "department_scope": doc.get_department_scope_list(),
                "valid_from": doc.valid_from,
                "valid_to": doc.valid_to
            }
            for doc in documents
        ]
    }


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
