"""Configuración leída de variables de entorno (ver .env.example)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite+pysqlite:///./pixtart.sqlite3"
    valkey_url: str = "redis://localhost:6379/0"
    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "pixtart"
    s3_secret_key: str = "pixtart-dev-secret"
    s3_bucket: str = "pdfs"
    jwt_secret: str = "dev-only-secret"
    master_key: str = ""
    # En tests: las tareas Celery corren en el mismo proceso.
    celery_eager: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
