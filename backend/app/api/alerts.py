"""
Alerts API endpoints
"""
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.alert import AlertsSummaryResponse
from app.services.alert_service import alert_service

router = APIRouter()


@router.get("/summary", response_model=AlertsSummaryResponse)
async def get_alerts_summary(
    quarter: Optional[str] = None,
    year: Optional[int] = None,
    department_id: Optional[int] = None,
    employee_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    return alert_service.get_summary(
        db,
        quarter=quarter,
        year=year,
        department_id=department_id,
        employee_id=employee_id,
    )
