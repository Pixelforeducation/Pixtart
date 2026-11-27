"""Dependencias inyectables del juego (sustituibles con `app.dependency_overrides` en tests)."""

import random
from datetime import UTC, datetime

from app.play.fuente_cursos import FuenteCursos, FuenteCursosSQL
from app.play.pista import GeneradorPista, GeneradorPistaAnthropic
from app.play.revision import GeneradorRevision, GeneradorRevisionAnthropic


def ahora() -> datetime:
    """Reloj del servidor (aware, UTC)."""
    return datetime.now(UTC)


def rng() -> random.Random:
    """RNG por petición; nunca el `random` global."""
    return random.Random()


def fuente_cursos() -> FuenteCursos:
    return FuenteCursosSQL()


def generador_pista() -> GeneradorPista:
    return GeneradorPistaAnthropic()


def generador_revision() -> GeneradorRevision:
    return GeneradorRevisionAnthropic()
