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
    return integration_service.list_systems()


@router.post("/export-goals", response_model=GoalsExportResponse)
async def export_goals_to_hr_system(
    request: GoalsExportRequest,
    db: Session = Depends(get_db),
):
    try:
        return integration_service.export_goals(db, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
