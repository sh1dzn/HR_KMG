"""
LLM Service - OpenAI GPT-4 Integration
"""
import asyncio
import json
from typing import Optional, Dict, Any, List
from openai import OpenAI
from app.config import settings


ALLOWED_MODELS = {
    'gpt-5-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo',
    'gpt-4o-2024-08-06', 'gpt-4o-2024-11-20', 'gpt-4o-mini-2024-07-18',
    'o1', 'o1-mini', 'o1-preview', 'o3-mini',
}


class LLMService:
    """Service for interacting with OpenAI GPT-4"""

    def __init__(self):
        self._client = None
        self.model = settings.OPENAI_MODEL

    @property
    def client(self):
        if self._client is None:
            self._client = OpenAI(api_key=settings.OPENAI_API_KEY)
        return self._client

    def _resolve_model(self, requested_model: Optional[str]) -> str:
        """Pick a model compatible with chat.completions in current stack."""
        use_model = self.model
        if requested_model and requested_model in ALLOWED_MODELS:
            use_model = requested_model

        # gpt-5* may be unavailable for this SDK/method pair; keep service stable.
        if use_model.startswith("gpt-5"):
            return "gpt-4o-mini"
        return use_model

    def _supports_max_completion_tokens(self, error: Exception) -> bool:
        message = str(error).lower()
        return "max_completion_tokens" in message and "max_tokens" in message

    async def _create_chat_completion(self, kwargs: Dict[str, Any]):
        """
        Run chat.completions and transparently adapt token parameter for
        models that reject `max_tokens`.
        """
        try:
            return await asyncio.to_thread(self.client.chat.completions.create, **kwargs)
        except Exception as exc:
            if self._supports_max_completion_tokens(exc) and "max_tokens" in kwargs:
                retry_kwargs = dict(kwargs)
                retry_kwargs["max_completion_tokens"] = retry_kwargs.pop("max_tokens")
                return await asyncio.to_thread(self.client.chat.completions.create, **retry_kwargs)
            raise

    async def complete(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 2000,
        response_format: Optional[Dict] = None,
        model: Optional[str] = None
    ) -> str:
        """
        Generate completion from GPT-4

        Args:
            prompt: User prompt
            system_prompt: System instructions
            temperature: Creativity level (0.0-1.0)
            max_tokens: Maximum response length
            response_format: Optional JSON response format

        Returns:
            Generated text response
        """
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

    def _extract_usage(self, response: Any) -> Dict[str, int]:
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

    async def complete_messages_with_usage(
        self,
        messages: List[Dict[str, Any]],
        temperature: float = 0.3,
        max_tokens: int = 2000,
        response_format: Optional[Dict] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        use_model = self._resolve_model(model)

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
            response = await self._create_chat_completion(kwargs)
        except Exception:
            # Retry once on a broadly compatible model.
            if use_model != "gpt-4o-mini":
                kwargs["model"] = "gpt-4o-mini"
                final_model = "gpt-4o-mini"
                response = await self._create_chat_completion(kwargs)
            else:
                raise

        content = response.choices[0].message.content or ""
        return {
            "content": content,
            "usage": self._extract_usage(response),
            "model": final_model,
        }

    async def complete_json(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.2,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate JSON response from GPT-4

        Args:
            prompt: User prompt
            system_prompt: System instructions
            temperature: Creativity level

        Returns:
            Parsed JSON dictionary
        """
        response = await self.complete(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=temperature,
            response_format={"type": "json_object"},
            model=model
        )

        return json.loads(response)

    def get_embeddings(self, texts: List[str]) -> List[List[float]]:
        """
        Get embeddings for texts using OpenAI

        Args:
            texts: List of texts to embed

        Returns:
            List of embedding vectors
        """
        response = self.client.embeddings.create(
            model=settings.OPENAI_EMBEDDING_MODEL,
            input=texts
        )

        return [item.embedding for item in response.data]

    def get_embedding(self, text: str) -> List[float]:
        """
        Get embedding for single text

        Args:
            text: Text to embed

        Returns:
            Embedding vector
        """
        return self.get_embeddings([text])[0]


# Global instance
llm_service = LLMService()
