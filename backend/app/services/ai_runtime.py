"""
Per-request AI runtime overrides (provider + API key) via ContextVar.
"""
from __future__ import annotations

from contextvars import ContextVar, Token
from typing import Dict


_provider_var: ContextVar[str] = ContextVar("ai_provider", default="openai")
_api_key_var: ContextVar[str] = ContextVar("ai_api_key", default="")

_ALLOWED_PROVIDERS = {"openai", "anthropic"}


def _sanitize_provider(provider: str | None) -> str:
    value = (provider or "").strip().lower()
    return value if value in _ALLOWED_PROVIDERS else "openai"


def _sanitize_api_key(api_key: str | None) -> str:
    value = (api_key or "").strip()
    # Hard cap to avoid abuse via oversized headers.
    return value[:500]


def set_request_ai_runtime(provider: str | None, api_key: str | None) -> tuple[Token[str], Token[str]]:
    provider_token = _provider_var.set(_sanitize_provider(provider))
    api_key_token = _api_key_var.set(_sanitize_api_key(api_key))
    return provider_token, api_key_token


def reset_request_ai_runtime(tokens: tuple[Token[str], Token[str]]) -> None:
    provider_token, api_key_token = tokens
    _provider_var.reset(provider_token)
    _api_key_var.reset(api_key_token)


def get_request_ai_runtime() -> Dict[str, str]:
    return {
        "provider": _provider_var.get(),
        "api_key": _api_key_var.get(),
    }
