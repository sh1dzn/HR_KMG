"""
API Routes for HR AI Module
"""
import importlib
import logging

from fastapi import APIRouter

logger = logging.getLogger("hr_ai.api")

api_router = APIRouter()

_ROUTER_SPECS = [
    ("auth", "/auth", ["Авторизация"]),
    ("employees", "/employees", ["Сотрудники"]),
    ("goals", "/goals", ["Цели"]),
    ("evaluation", "/evaluation", ["Оценка целей (SMART)"]),
    ("generation", "/generation", ["Генерация целей (RAG)"]),
    ("dashboard", "/dashboard", ["Аналитика и дашборд"]),
    ("analytics", "/dashboard", ["Расширенная аналитика"]),
    ("alerts", "/alerts", ["Алерты качества"]),
    ("integrations", "/integrations", ["Интеграции (1C/SAP/Oracle)"]),
    ("prediction", "/goals", ["Предсказание рисков"]),
    ("cascade", "/goals", ["Каскадирование целей"]),
    ("dependencies", "/goals", ["Граф зависимостей"]),
    ("chat", "/chat", ["AI Ассистент"]),
    ("documents", "/documents", ["Документы ВНД"]),
    ("strategy", "/strategy", ["Карта стратегии"]),
    ("mcp", "/mcp", ["MCP Remote"]),
]

for module_name, prefix, tags in _ROUTER_SPECS:
    try:
        module = importlib.import_module(f"app.api.{module_name}")
        api_router.include_router(module.router, prefix=prefix, tags=tags)
    except Exception as exc:
        logger.warning("Router %s is skipped due to import error: %s", module_name, exc)


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
    {"name": "AI Ассистент", "description": "Чат с AI-ассистентом: история диалогов, RAG по ВНД, контекст роли"},
    {"name": "Документы ВНД", "description": "Управление внутренними нормативными документами: просмотр, загрузка, редактирование"},
    {"name": "MCP Remote", "description": "Публичный MCP endpoint (HTTP JSON-RPC) для внешних AI-клиентов"},
]
