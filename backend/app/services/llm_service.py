"""
LLM Service with provider routing (OpenAI / Anthropic).
"""
import asyncio
import json
from typing import Optional, Dict, Any, List

from openai import OpenAI

from app.config import settings
from app.services.ai_runtime import get_request_ai_runtime

try:
    from anthropic import AsyncAnthropic
except Exception:  # pragma: no cover - optional dependency
    AsyncAnthropic = None


OPENAI_ALLOWED_MODELS = {
    "gpt-5-mini", "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo",
    "gpt-4o-2024-08-06", "gpt-4o-2024-11-20", "gpt-4o-mini-2024-07-18",
    "o1", "o1-mini", "o1-preview", "o3-mini",
}

ANTHROPIC_ALLOWED_MODELS = {
    "claude-3-5-sonnet-latest",
    "claude-3-5-haiku-latest",
    "claude-3-7-sonnet-latest",
    "claude-sonnet-4-5",
    "claude-opus-4-1",
}


class LLMService:
    """Service for interacting with text LLM providers."""

    def __init__(self):
        self.openai_default_model = settings.OPENAI_MODEL
        self.anthropic_default_model = settings.ANTHROPIC_MODEL
        self._openai_clients: dict[str, OpenAI] = {}
        self._anthropic_clients: dict[str, Any] = {}

    def _resolve_runtime_provider_and_key(self) -> tuple[str, str]:
        runtime = get_request_ai_runtime()
        provider = runtime.get("provider") or "openai"
        api_key = runtime.get("api_key") or ""
        if provider == "anthropic":
            return provider, (api_key or settings.ANTHROPIC_API_KEY or "")
        return "openai", (api_key or settings.OPENAI_API_KEY or "")

    def has_completion_credentials(self) -> bool:
        _, api_key = self._resolve_runtime_provider_and_key()
        return bool(api_key)

    def has_openai_credentials(self) -> bool:
        runtime = get_request_ai_runtime()
        runtime_provider = runtime.get("provider") or "openai"
        runtime_key = (runtime.get("api_key") or "").strip()
        if runtime_provider == "openai" and runtime_key:
            return True
        return bool(settings.OPENAI_API_KEY)

    def _resolve_model(self, provider: str, requested_model: Optional[str]) -> str:
        if provider == "anthropic":
            use_model = self.anthropic_default_model or "claude-3-5-sonnet-latest"
            if requested_model and requested_model in ANTHROPIC_ALLOWED_MODELS:
                use_model = requested_model
            return use_model

        use_model = self.openai_default_model or "gpt-4o"
        if requested_model and requested_model in OPENAI_ALLOWED_MODELS:
            use_model = requested_model

        # gpt-5* may be unavailable for this SDK/method pair; keep service stable.
        if use_model.startswith("gpt-5"):
            return "gpt-4o-mini"
        return use_model

    def _supports_max_completion_tokens(self, error: Exception) -> bool:
        message = str(error).lower()
        return "max_completion_tokens" in message and "max_tokens" in message

    def _get_openai_client(self, api_key: str) -> OpenAI:
        if not api_key:
            raise RuntimeError("OpenAI API key is not configured")
        client = self._openai_clients.get(api_key)
        if client is None:
            client = OpenAI(api_key=api_key)
            self._openai_clients[api_key] = client
        return client

    def _get_anthropic_client(self, api_key: str):
        if AsyncAnthropic is None:
            raise RuntimeError("Anthropic SDK is not installed")
        if not api_key:
            raise RuntimeError("Anthropic API key is not configured")
        client = self._anthropic_clients.get(api_key)
        if client is None:
            client = AsyncAnthropic(api_key=api_key)
            self._anthropic_clients[api_key] = client
        return client

    async def _create_openai_chat_completion(self, client: OpenAI, kwargs: Dict[str, Any]):
        """Run OpenAI chat.completions and adapt token parameter if needed."""
        try:
            return await asyncio.to_thread(client.chat.completions.create, **kwargs)
        except Exception as exc:
            if self._supports_max_completion_tokens(exc) and "max_tokens" in kwargs:
                retry_kwargs = dict(kwargs)
                retry_kwargs["max_completion_tokens"] = retry_kwargs.pop("max_tokens")
                return await asyncio.to_thread(client.chat.completions.create, **retry_kwargs)
            raise

    def _normalize_content(self, content: Any) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = []
            for item in content:
                if isinstance(item, dict):
                    text = item.get("text")
                    if text:
                        parts.append(str(text))
                elif item:
                    parts.append(str(item))
            return "\n".join(parts)
        return str(content or "")

    def _build_anthropic_payload(
        self,
        messages: List[Dict[str, Any]],
        *,
        model: str,
        temperature: float,
        max_tokens: int,
        response_format: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        system_parts: list[str] = []
        anthropic_messages: list[dict[str, str]] = []

        for message in messages:
            role = str(message.get("role", "user"))
            content = self._normalize_content(message.get("content"))
            if role == "system":
                if content.strip():
                    system_parts.append(content.strip())
                continue
            if role in {"user", "assistant"}:
                anthropic_messages.append({"role": role, "content": content})

        if not anthropic_messages:
            anthropic_messages = [{"role": "user", "content": ""}]

        if response_format:
            system_parts.append("Верни только валидный JSON-объект без markdown и пояснений.")

        payload: Dict[str, Any] = {
            "model": model,
            "messages": anthropic_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if system_parts:
            payload["system"] = "\n\n".join(system_parts)
        return payload

    def _extract_openai_usage(self, response: Any) -> Dict[str, int]:
        usage = getattr(response, "usage", None)
        if usage is None:
            return {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}

        input_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
        total_tokens_raw = getattr(usage, "total_tokens", None)
        total_tokens = int(total_tokens_raw) if total_tokens_raw is not None else input_tokens + output_tokens

        return {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": total_tokens,
        }

    def _extract_anthropic_usage(self, response: Any) -> Dict[str, int]:
        usage = getattr(response, "usage", None)
        if usage is None:
            return {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}

        input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
        return {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
        }

    async def complete(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 2000,
        response_format: Optional[Dict] = None,
        model: Optional[str] = None,
    ) -> str:
        """Generate completion from selected provider."""
        messages = []

        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        return await self.complete_messages(
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format=response_format,
            model=model,
        )

    async def complete_messages(
        self,
        messages: List[Dict[str, Any]],
        temperature: float = 0.3,
        max_tokens: int = 2000,
        response_format: Optional[Dict] = None,
        model: Optional[str] = None,
    ) -> str:
        result = await self.complete_messages_with_usage(
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format=response_format,
            model=model,
        )
        return result["content"]

    async def complete_messages_with_usage(
        self,
        messages: List[Dict[str, Any]],
        temperature: float = 0.3,
        max_tokens: int = 2000,
        response_format: Optional[Dict] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        provider, api_key = self._resolve_runtime_provider_and_key()
        use_model = self._resolve_model(provider, model)

        if provider == "anthropic":
            client = self._get_anthropic_client(api_key)
            payload = self._build_anthropic_payload(
                messages,
                model=use_model,
                temperature=temperature,
                max_tokens=max_tokens,
                response_format=response_format,
            )
            final_model = use_model
            try:
                response = await client.messages.create(**payload)
            except Exception:
                fallback_model = self._resolve_model("anthropic", None)
                if fallback_model == use_model:
                    raise
                payload["model"] = fallback_model
                final_model = fallback_model
                response = await client.messages.create(**payload)

            parts = []
            for block in getattr(response, "content", []) or []:
                if getattr(block, "type", None) == "text":
                    parts.append(getattr(block, "text", ""))
            content = "".join(parts).strip()
            return {
                "content": content,
                "usage": self._extract_anthropic_usage(response),
                "model": final_model,
                "provider": "anthropic",
            }

        client = self._get_openai_client(api_key)
        kwargs = {
            "model": use_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format:
            kwargs["response_format"] = response_format

        final_model = use_model
        try:
            response = await self._create_openai_chat_completion(client, kwargs)
        except Exception:
            # Retry once on a broadly compatible model.
            if use_model != "gpt-4o-mini":
                kwargs["model"] = "gpt-4o-mini"
                final_model = "gpt-4o-mini"
                response = await self._create_openai_chat_completion(client, kwargs)
            else:
                raise

        content = response.choices[0].message.content or ""
        return {
            "content": content,
            "usage": self._extract_openai_usage(response),
            "model": final_model,
            "provider": "openai",
        }

    async def complete_json(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.2,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate JSON response from selected provider."""
        response = await self.complete(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=temperature,
            response_format={"type": "json_object"},
            model=model,
        )

        payload = (response or "").strip()
        if payload.startswith("```"):
            payload = payload.strip("`")
            payload = payload.replace("json\n", "", 1).strip()
        if not payload.startswith("{"):
            start = payload.find("{")
            end = payload.rfind("}")
            if start != -1 and end != -1 and end > start:
                payload = payload[start : end + 1]

        return json.loads(payload)

    def get_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Get embeddings for texts using OpenAI."""
        runtime = get_request_ai_runtime()
        runtime_provider = runtime.get("provider") or "openai"
        runtime_key = (runtime.get("api_key") or "").strip()
        api_key = runtime_key if runtime_provider == "openai" and runtime_key else settings.OPENAI_API_KEY
        client = self._get_openai_client(api_key)

        response = client.embeddings.create(
            model=settings.OPENAI_EMBEDDING_MODEL,
            input=texts,
        )
        return [item.embedding for item in response.data]

    def get_embedding(self, text: str) -> List[float]:
        """Get embedding for single text."""
        return self.get_embeddings([text])[0]


# Global instance
llm_service = LLMService()
