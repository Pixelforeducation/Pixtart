"""Adaptadores hacia otros módulos (plataforma) y servicios sustituibles en tests.

Los módulos de plataforma (`app.auth.deps`, `app.keys.service`) se importan de forma perezosa
para que el pipeline no dependa del orden de integración. En tests se sustituyen los campos de
`servicios` (almacén, LLM, keys, uso, OCR, sesión) y `usuario_actual` con dependency_overrides.
"""

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.llm.base import ClienteLLM
from app.pipeline.almacen import Almacen
from app.pipeline.extraccion import ExtractorOCR, ocr_disponible, ocr_tesseract

try:  # pragma: no cover - depende de la integración con plataforma
    from app.auth.deps import usuario_actual
except ImportError:  # pragma: no cover

    def usuario_actual():  # type: ignore[misc]
        raise HTTPException(status_code=401, detail="Autenticación no disponible.")


class LimiteExcedido(Exception):
    """Equivalente local de `app.keys.service.LimiteExcedido` (para fakes de tests)."""

    def __init__(self, mensaje: str = "Llegaste a tu tope de tokens.", periodo: str = ""):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.periodo = periodo


def clases_limite() -> tuple[type[Exception], ...]:
    try:
        from app.keys.service import LimiteExcedido as Remoto
    except ImportError:
        return (LimiteExcedido,)
    return (LimiteExcedido, Remoto)


def mensaje_limite(e: Exception) -> str:
    return getattr(e, "mensaje", None) or str(e) or "Llegaste a tu tope de tokens."


# ---- adaptadores por defecto hacia app.keys.service (import perezoso) ----

def _obtener_key(db: Session, usuario_id: str) -> str | None:
    from app.keys.service import obtener_key_descifrada

    return obtener_key_descifrada(db, usuario_id)


def _obtener_modelo(db: Session, usuario_id: str) -> str | None:
    try:
        from app.keys.service import obtener_modelo
    except ImportError:
        return None
    return obtener_modelo(db, usuario_id)


def _verificar_limite(db: Session, usuario_id: str) -> None:
    try:
        from app.keys.service import verificar_limite
    except ImportError:
        return
    verificar_limite(db, usuario_id)


def _registrar_uso(db: Session, usuario_id: str, tokens_entrada: int, tokens_salida: int) -> None:
    from app.keys.service import registrar_uso

    registrar_uso(db, usuario_id, tokens_entrada, tokens_salida)


def _marcar_key_invalida(db: Session, usuario_id: str) -> None:
    try:
        from app.keys.service import marcar_key_invalida
    except ImportError:
        return
    marcar_key_invalida(db, usuario_id)


def _fabrica_llm(api_key: str, modelo: str | None) -> ClienteLLM:
    from app.llm.anthropic_cliente import ClienteAnthropic

    return ClienteAnthropic(api_key, modelo)


def _almacen() -> Almacen:
    from app.core.config import get_settings
    from app.pipeline.almacen import AlmacenDisco, AlmacenS3

    return AlmacenS3() if get_settings().almacen == "s3" else AlmacenDisco()


def _ocr() -> ExtractorOCR | None:
    return ocr_tesseract if ocr_disponible() else None


@contextmanager
def _sesion() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@dataclass
class Servicios:
    fabrica_llm: Callable[[str, str | None], ClienteLLM] = _fabrica_llm
    obtener_key: Callable[[Session, str], str | None] = _obtener_key
    obtener_modelo: Callable[[Session, str], str | None] = _obtener_modelo
    verificar_limite: Callable[[Session, str], None] = _verificar_limite
    registrar_uso: Callable[[Session, str, int, int], None] = _registrar_uso
    marcar_key_invalida: Callable[[Session, str], None] = _marcar_key_invalida
    crear_almacen: Callable[[], Almacen] = _almacen
    obtener_ocr: Callable[[], ExtractorOCR | None] = _ocr
    sesion: Callable[[], object] = _sesion
    _almacen_cache: Almacen | None = field(default=None, repr=False)

    def almacen(self) -> Almacen:
        if self._almacen_cache is None:
            self._almacen_cache = self.crear_almacen()
        return self._almacen_cache


servicios = Servicios()


def obtener_almacen() -> Almacen:
    """Dependencia FastAPI."""
    return servicios.almacen()
