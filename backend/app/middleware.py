"""
Middleware for structured request logging, request-id tracing, and error handling.
"""
import logging
import time
import uuid
from contextvars import ContextVar

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from app.services.ai_runtime import set_request_ai_runtime, reset_request_ai_runtime

logger = logging.getLogger("hr_ai")

request_id_var: ContextVar[str] = ContextVar("request_id", default="")


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Injects X-Request-ID into every request/response for traceability."""

    async def dispatch(self, request: Request, call_next) -> Response:
        rid = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request_id_var.set(rid)
        request.state.request_id = rid

        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Logs every request with method, path, status, and duration."""

    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 1)

        rid = getattr(request.state, "request_id", "")
        logger.info(
            "%s %s %s %sms [%s]",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            rid,
        )
        return response


class AIConfigMiddleware(BaseHTTPMiddleware):
    """Injects per-request AI provider/key overrides from headers."""

    async def dispatch(self, request: Request, call_next) -> Response:
        provider = request.headers.get("X-AI-Provider")
        api_key = request.headers.get("X-AI-Api-Key")
        tokens = set_request_ai_runtime(provider, api_key)
        request.state.ai_provider = provider
        try:
            return await call_next(request)
        finally:
            reset_request_ai_runtime(tokens)
