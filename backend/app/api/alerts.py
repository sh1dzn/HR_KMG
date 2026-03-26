"""
Alerts API endpoints
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import require_role
from app.models.user import User
from app.schemas.alert import AlertsSummaryResponse
from app.services.alert_service import alert_service

router = APIRouter()


@router.get("/summary", response_model=AlertsSummaryResponse)
async def get_alerts_summary(
    quarter: Optional[str] = None,
    year: Optional[int] = None,
    department_id: Optional[int] = None,
    employee_id: Optional[int] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "admin")),
):
    return alert_service.get_summary(
        db,
        quarter=quarter,
        year=year,
        department_id=department_id,
        employee_id=employee_id,
        page=page,
        per_page=per_page,
    )
