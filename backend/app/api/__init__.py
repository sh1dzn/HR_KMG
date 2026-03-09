"""
API Routes for HR AI Module
"""
from fastapi import APIRouter
from app.api import goals, evaluation, generation, dashboard, employees

api_router = APIRouter()

# Include all routers
api_router.include_router(
    employees.router,
    prefix="/employees",
    tags=["Сотрудники"]
)

api_router.include_router(
    goals.router,
    prefix="/goals",
    tags=["Цели"]
)

api_router.include_router(
    evaluation.router,
    prefix="/evaluation",
    tags=["Оценка целей"]
)

api_router.include_router(
    generation.router,
    prefix="/generation",
    tags=["Генерация целей"]
)

api_router.include_router(
    dashboard.router,
    prefix="/dashboard",
    tags=["Дашборд"]
)
