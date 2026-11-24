"""Dependencias de FastAPI: usuario autenticado y fecha de hoy (sustituible en tests)."""

from datetime import date

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.seguridad import leer_token
from app.core.db import get_db
from app.models.usuarios import Usuario

_bearer = HTTPBearer(auto_error=False)

_NO_AUTENTICADO = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Tu sesión no es válida o caducó. Inicia sesión de nuevo.",
    headers={"WWW-Authenticate": "Bearer"},
)


def hoy() -> date:
    """Fecha actual; en tests se sustituye con `app.dependency_overrides[hoy]`."""
    return date.today()


def usuario_actual(
    credenciales: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Usuario:
    if credenciales is None or credenciales.scheme.lower() != "bearer":
        raise _NO_AUTENTICADO
    usuario_id = leer_token(credenciales.credentials)
    if usuario_id is None:
        raise _NO_AUTENTICADO
    usuario = db.get(Usuario, usuario_id)
    if usuario is None:
        raise _NO_AUTENTICADO
    return usuario
