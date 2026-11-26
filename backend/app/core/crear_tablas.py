"""Crea las tablas sin migraciones (solo desarrollo local, hasta que existan las de Alembic).

Idempotente: además de `create_all`, añade columnas nuevas a tablas ya existentes (solo en
PostgreSQL; SQLite de tests crea las tablas desde cero) y asegura el nivel final de cada
sección de los cursos existentes (mejora 8).
"""

from sqlalchemy import Engine, text
from sqlalchemy.orm import Session

import app.models  # noqa: F401
from app.models.base import Base

#: Columnas añadidas después de crear la tabla (v0.3). `ADD COLUMN IF NOT EXISTS` es idempotente.
ALTERS_POSTGRES = ("ALTER TABLE juego_estado ADD COLUMN IF NOT EXISTS extras JSON",)


def crear_tablas(engine: Engine) -> int:
    """Crea/actualiza el esquema y devuelve cuántos niveles finales se añadieron."""
    from app.pipeline.servicio import asegurar_niveles_finales_todos  # noqa: PLC0415

    Base.metadata.create_all(engine)
    if engine.dialect.name == "postgresql":
        with engine.begin() as con:
            for sql in ALTERS_POSTGRES:
                con.execute(text(sql))
    with Session(engine) as db:
        return asegurar_niveles_finales_todos(db)


if __name__ == "__main__":
    from app.core.db import engine

    finales = crear_tablas(engine)
    print(f"tablas creadas ({finales} niveles finales añadidos)")
