"""Crea las tablas sin migraciones (solo desarrollo local, hasta que existan las de Alembic)."""

import app.models  # noqa: F401
from app.core.db import engine
from app.models.base import Base

if __name__ == "__main__":
    Base.metadata.create_all(engine)
    print("tablas creadas")
