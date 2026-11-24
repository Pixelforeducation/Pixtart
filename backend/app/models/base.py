"""Base declarativa común. Cada agente define sus tablas en su propio archivo de app/models/
y lo importa en app/models/__init__.py (una línea por archivo, para evitar conflictos)."""

from datetime import UTC, datetime

from sqlalchemy import DateTime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
