"""
HR AI Module - Main FastAPI Application
Модуль AI для управления целями сотрудников
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.config import settings
from app.database import init_db
from app.api import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    # Startup
    print("🚀 Запуск HR AI Module...")
    init_db()
    print("✅ База данных инициализирована")
    yield
    # Shutdown
    print("👋 Остановка HR AI Module...")


app = FastAPI(
    title=settings.APP_NAME,
    description="""
## HR AI Module - Модуль AI для управления целями

### Основные возможности:

#### 🎯 Оценка целей (SMART)
- Автоматическая оценка целей по методологии SMART
- Детальный анализ каждого критерия
- Рекомендации по улучшению
- Переформулировка слабых целей

#### 🔧 Генерация целей
- Генерация целей на основе ВНД и стратегии
- Привязка к источникам (документам)
- Каскадирование от целей руководителя
- Учёт фокус-направлений квартала

#### 📊 Аналитика
- Дашборд качества целеполагания
- Статистика по подразделениям
- Индекс зрелости целеполагания
- Топ проблем и рекомендации

### API Версия: {version}
    """.format(version=settings.APP_VERSION),
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене указать конкретные домены
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router, prefix="/api")


@app.get("/")
async def root():
    """Корневой эндпоинт"""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs",
        "api": "/api"
    }


@app.get("/health")
async def health_check():
    """Проверка здоровья сервиса"""
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )
