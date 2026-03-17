"""
Mock integrations API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.integration import GoalsExportRequest, GoalsExportResponse, IntegrationSystemsResponse
from app.services.integration_service import integration_service

router = APIRouter()


@router.get("/systems", response_model=IntegrationSystemsResponse)
async def get_integration_systems():
    """
    Получить список доступных HR-систем для интеграции.

    Возвращает mock-системы: 1C:ЗУП, SAP SuccessFactors, Oracle HCM.
    Каждая система формирует payload в своём формате при экспорте.
    """
    return integration_service.list_systems()


@router.post("/export-goals", response_model=GoalsExportResponse)
async def export_goals_to_hr_system(
    request: GoalsExportRequest,
    db: Session = Depends(get_db),
):
    """
    Экспортировать цели сотрудника во внешнюю HR-систему (mock).

    Формирует payload в формате целевой системы (1C/SAP/Oracle),
    присваивает каждой цели external_ref и возвращает batch_id для отслеживания.
    Файл экспорта можно скачать на фронтенде.
    """
    try:
        return integration_service.export_goals(db, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
