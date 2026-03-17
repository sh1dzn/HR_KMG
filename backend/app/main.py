"""
HR AI Module - Main FastAPI Application
Модуль AI для управления целями сотрудников
"""
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from app.config import settings
from app.database import init_db, engine
from app.api import api_router, TAGS_METADATA
from app.middleware import RequestIdMiddleware, RequestLoggingMiddleware

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("hr_ai")


# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting HR AI Module v%s", settings.APP_VERSION)
    init_db()
    logger.info("Database connected")
    yield
    logger.info("Shutting down HR AI Module")


# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    description="""
## HR AI Module — AI-модуль управления целями сотрудников

### Возможности API

| Домен | Описание |
|-------|----------|
| **Оценка целей** | SMART-анализ с оценкой по 5 критериям, переформулировка, пакетная оценка |
| **Генерация целей** | RAG-генерация на основе ВНД, каскадирование от руководителя |
| **Workflow** | Жизненный цикл цели: submit → approve/reject, комментарии, аудит-трейл |
| **Аналитика** | Дашборд зрелости, тренды по кварталам, индекс по подразделениям |
| **Алерты** | Уведомления о слабых целях, дисбалансе весов, отсутствии согласования |
| **Интеграции** | Mock-экспорт в 1C, SAP SuccessFactors, Oracle HCM |

### Интеграция

Все эндпоинты принимают и возвращают JSON. Аутентификация не требуется
(хакатонный контур). Для production-интеграции добавьте Bearer-токен
через middleware.

### Версия: {version}
    """.format(version=settings.APP_VERSION),
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=TAGS_METADATA,
    lifespan=lifespan,
)

# ─── Middleware (order matters: first added = outermost) ──────────────────────

# CORS
ALLOWED_ORIGINS = [
    "https://hr-kmg.silkroadtech.kz",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request-ID tracing
app.add_middleware(RequestIdMiddleware)

# Structured request logging
app.add_middleware(RequestLoggingMiddleware)


# ─── Global error handler ────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    rid = getattr(request.state, "request_id", None)
    logger.exception("Unhandled error [%s]: %s", rid, exc)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Внутренняя ошибка сервера",
            "request_id": rid,
        },
    )


# ─── API routes ──────────────────────────────────────────────────────────────
app.include_router(api_router, prefix="/api")


# ─── Root & Health ───────────────────────────────────────────────────────────
@app.get("/", tags=["Служебные"])
async def root():
    """Корневой эндпоинт с метаинформацией о сервисе."""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs",
        "redoc": "/redoc",
        "api": "/api",
    }


@app.get("/health", tags=["Служебные"])
async def health_check():
    """
    Проверка здоровья сервиса.

    Проверяет доступность PostgreSQL и возвращает статус.
    Используйте для мониторинга и load-balancer health probes.
    """
    db_ok = True
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    chroma_chunks = 0
    try:
        from app.services.rag_service import rag_service
        chroma_chunks = rag_service.collection.count()
    except Exception:
        pass

    status = "healthy" if db_ok else "degraded"
    return {
        "status": status,
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "checks": {
            "database": "ok" if db_ok else "unavailable",
            "openai_configured": bool(settings.OPENAI_API_KEY),
            "chroma_chunks": chroma_chunks,
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
    )
