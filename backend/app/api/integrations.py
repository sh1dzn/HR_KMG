"""
Sandbox integrations API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import require_role
from app.models.user import User
from app.schemas.integration import (
    GoalsExportRequest,
    GoalsExportResponse,
    IntegrationBatchCallbackRequest,
    IntegrationBatchInfo,
    IntegrationBatchRetryRequest,
    IntegrationBatchesResponse,
    IntegrationHealthResponse,
    IntegrationSystemsResponse,
)
from app.services.integration_service import integration_service

router = APIRouter()


@router.get("/systems", response_model=IntegrationSystemsResponse)
async def get_integration_systems(current_user: User = Depends(require_role("admin"))):
    """
    Получить список доступных HR-систем для интеграции.

    Возвращает sandbox-системы: 1C:ЗУП, SAP SuccessFactors, Oracle HCM.
    Каждая система формирует payload в своём формате.
    """
    return integration_service.list_systems()


@router.post("/export-goals", response_model=GoalsExportResponse)
async def export_goals_to_hr_system(
    request: GoalsExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """
    Экспортировать цели сотрудника во внешнюю HR-систему (sandbox).

    Формирует payload в формате целевой системы (1C/SAP/Oracle),
    присваивает каждой цели external_ref, имитирует доставку
    и возвращает batch_id для отслеживания.
    """
    try:
        return integration_service.export_goals(db, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/batches", response_model=IntegrationBatchesResponse)
async def list_integration_batches(
    limit: int = 20,
    current_user: User = Depends(require_role("admin")),
):
    _ = current_user
    return integration_service.list_batches(limit=max(1, min(limit, 100)))


@router.get("/health", response_model=IntegrationHealthResponse)
async def get_integration_health(current_user: User = Depends(require_role("admin"))):
    _ = current_user
    return integration_service.get_health()


@router.post("/batches/{batch_id}/callback", response_model=IntegrationBatchInfo)
async def simulate_hri_callback(
    batch_id: str,
    request: IntegrationBatchCallbackRequest,
    current_user: User = Depends(require_role("admin")),
):
    _ = current_user
    try:
        return integration_service.apply_callback(batch_id, request)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/batches/{batch_id}/retry", response_model=IntegrationBatchInfo)
async def retry_batch_delivery(
    batch_id: str,
    request: IntegrationBatchRetryRequest,
    current_user: User = Depends(require_role("admin")),
):
    _ = current_user
    try:
        return integration_service.retry_batch(batch_id, request)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
