"""
Employees API endpoints
Список сотрудников
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from app.database import get_db
from app.models import Employee


class EmployeeShort(BaseModel):
    id: int
    full_name: str
    position_name: Optional[str] = None
    department_name: Optional[str] = None

    class Config:
        from_attributes = True


class EmployeeListResponse(BaseModel):
    employees: List[EmployeeShort]
    total: int


router = APIRouter()


@router.get("/", response_model=EmployeeListResponse)
async def get_employees(
    department_id: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Получить список сотрудников"""
    query = db.query(Employee).filter(Employee.is_active == True)

    if department_id:
        query = query.filter(Employee.department_id == department_id)
    if search:
        query = query.filter(Employee.full_name.ilike(f"%{search}%"))

    query = query.order_by(Employee.full_name)
    employees = query.all()

    result = []
    for emp in employees:
        result.append(EmployeeShort(
            id=emp.id,
            full_name=emp.full_name,
            position_name=emp.position.name if emp.position else None,
            department_name=emp.department.name if emp.department else None,
        ))

    return EmployeeListResponse(employees=result, total=len(result))
