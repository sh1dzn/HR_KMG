"""
Employees API endpoints
Список сотрудников
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, asc, desc
from sqlalchemy.orm import Session
from typing import Optional, List, Literal
from pydantic import BaseModel
from app.database import get_db
from app.dependencies.auth import require_role
from app.models.user import User
from app.models import Department, Employee, Position


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
    page: int = 1
    per_page: int = 50


EMPLOYEE_SORT_COLUMNS = {
    "full_name": Employee.full_name,
    "id": Employee.id,
}

router = APIRouter()


@router.get("/", response_model=EmployeeListResponse)
async def get_employees(
    department_id: Optional[int] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1, description="Номер страницы"),
    per_page: int = Query(50, ge=1, le=200, description="Записей на страницу"),
    sort_by: Optional[str] = Query(None, description="Поле сортировки: full_name, id"),
    sort_order: Literal["asc", "desc"] = Query("asc", description="Порядок: asc, desc"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "admin")),
):
    """Получить список сотрудников с пагинацией и сортировкой"""
    query = db.query(Employee).filter(Employee.is_active == True)

    if department_id:
        query = query.filter(Employee.department_id == department_id)
    if search:
        search_term = f"%{search.strip()}%"
        query = query.join(Position, Employee.position_id == Position.id, isouter=True).join(Department, Employee.department_id == Department.id, isouter=True)
        query = query.filter(
            or_(
                Employee.full_name.ilike(search_term),
                Employee.employee_code.ilike(search_term),
                Position.name.ilike(search_term),
                Department.name.ilike(search_term),
            )
        )

    total = query.count()

    # Sorting
    sort_col = EMPLOYEE_SORT_COLUMNS.get(sort_by, Employee.full_name)
    order_fn = desc if sort_order == "desc" else asc
    query = query.order_by(order_fn(sort_col))

    # Pagination
    employees = query.offset((page - 1) * per_page).limit(per_page).all()

    result = []
    for emp in employees:
        result.append(EmployeeShort(
            id=emp.id,
            full_name=emp.full_name,
            position_name=emp.position.name if emp.position else None,
            department_name=emp.department.name if emp.department else None,
        ))

    return EmployeeListResponse(employees=result, total=total, page=page, per_page=per_page)
