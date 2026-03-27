"""
API Routes for HR AI Module
"""
from fastapi import APIRouter
from app.api import alerts, analytics, auth, cascade, dependencies, goals, evaluation, generation, dashboard, employees, integrations, prediction

api_router = APIRouter()

# Include all routers
api_router.include_router(
    auth.router,
    prefix="/auth",
    tags=["Авторизация"],
)

api_router.include_router(
    employees.router,
    prefix="/employees",
    tags=["Сотрудники"],
)

api_router.include_router(
    goals.router,
    prefix="/goals",
    tags=["Цели"],
)

api_router.include_router(
    evaluation.router,
    prefix="/evaluation",
    tags=["Оценка целей (SMART)"],
)

api_router.include_router(
    generation.router,
    prefix="/generation",
    tags=["Генерация целей (RAG)"],
)

api_router.include_router(
    dashboard.router,
    prefix="/dashboard",
    tags=["Аналитика и дашборд"],
)

api_router.include_router(
    analytics.router,
    prefix="/dashboard",
    tags=["Расширенная аналитика"],
)

api_router.include_router(
    alerts.router,
    prefix="/alerts",
    tags=["Алерты качества"],
)

api_router.include_router(
    integrations.router,
    prefix="/integrations",
    tags=["Интеграции (1C/SAP/Oracle)"],
)

api_router.include_router(
    prediction.router,
    prefix="/goals",
    tags=["Предсказание рисков"],
)

api_router.include_router(
    cascade.router,
    prefix="/goals",
    tags=["Каскадирование целей"],
)

api_router.include_router(
    dependencies.router,
    prefix="/goals",
    tags=["Граф зависимостей"],
)


# OpenAPI tag metadata for Swagger UI ordering and descriptions
TAGS_METADATA = [
    {"name": "Авторизация", "description": "Вход, выход, обновление токена, смена пароля"},
    {"name": "Служебные", "description": "Health check и метаинформация сервиса"},
    {"name": "Сотрудники", "description": "Список сотрудников с поиском и фильтрацией по подразделению"},
    {"name": "Цели", "description": "CRUD целей, workflow согласования (submit/approve/reject/comment), аудит-трейл"},
    {"name": "Оценка целей (SMART)", "description": "Оценка одной цели или пакетная оценка по SMART-методологии, переформулировка"},
    {"name": "Генерация целей (RAG)", "description": "AI-генерация целей по ВНД и стратегии, каскадирование, управление индексом"},
    {"name": "Аналитика и дашборд", "description": "Сводная статистика, индекс зрелости, тренды по кварталам"},
    {"name": "Расширенная аналитика", "description": "Тепловая карта, бенчмаркинг отделов, повестка 1-on-1"},
    {"name": "Алерты качества", "description": "Уведомления о слабых целях, дисбалансе весов, стагнации согласования"},
    {"name": "Интеграции (1C/SAP/Oracle)", "description": "Mock-экспорт целей во внешние HR-системы"},
    {"name": "Предсказание рисков", "description": "Оценка риска невыполнения цели, LLM-объяснение"},
    {"name": "Каскадирование целей", "description": "Авто-каскадирование целей с обнаружением конфликтов"},
    {"name": "Граф зависимостей", "description": "Интерактивный граф зависимостей между целями"},
]
