"""
Configuration settings for HR AI Module
"""
from pydantic_settings import BaseSettings
from functools import lru_cache
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Application
    APP_NAME: str = "HR AI Module"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "sqlite:///./hr_goals.db"

    # OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"

    # ChromaDB
    CHROMA_PERSIST_DIR: str = "./chroma_data"
    CHROMA_COLLECTION_NAME: str = "vnd_documents"

    # SMART Evaluation thresholds
    SMART_THRESHOLD_LOW: float = 0.5
    SMART_THRESHOLD_MEDIUM: float = 0.7
    SMART_THRESHOLD_HIGH: float = 0.85

    # Goal generation settings
    MIN_GOALS_PER_EMPLOYEE: int = 3
    MAX_GOALS_PER_EMPLOYEE: int = 5

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()


settings = get_settings()
