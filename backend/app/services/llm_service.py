"""
LLM Service - OpenAI GPT-4 Integration
"""
import asyncio
import json
from typing import Optional, Dict, Any, List
from openai import OpenAI
from app.config import settings


ALLOWED_MODELS = {
    'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo',
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

        # Validate model — use requested if allowed, otherwise fallback to default
        use_model = self.model
        if model and model in ALLOWED_MODELS:
            use_model = model

        kwargs = {
            "model": use_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }

        if response_format:
            kwargs["response_format"] = response_format

        response = await asyncio.to_thread(self.client.chat.completions.create, **kwargs)

        return response.choices[0].message.content

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
