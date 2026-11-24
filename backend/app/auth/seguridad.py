"""Hash de contraseñas (argon2) y tokens JWT (HS256, 7 días)."""

from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.config import get_settings

ALGORITMO = "HS256"
DURACION_TOKEN = timedelta(days=7)

_hasher = PasswordHasher()


def hashear_contrasena(contrasena: str) -> str:
    return _hasher.hash(contrasena)


def verificar_contrasena(hash_guardado: str, contrasena: str) -> bool:
    try:
        return _hasher.verify(hash_guardado, contrasena)
    except (VerificationError, InvalidHashError):
        return False


def crear_token(usuario_id: str, ahora: datetime | None = None) -> str:
    ahora = ahora or datetime.now(UTC)
    payload = {"sub": usuario_id, "iat": ahora, "exp": ahora + DURACION_TOKEN}
    return jwt.encode(payload, get_settings().jwt_secret, algorithm=ALGORITMO)


def leer_token(token: str) -> str | None:
    """Devuelve el `usuario_id` del token o None si es inválido o caducó."""
    try:
        payload = jwt.decode(
            token, get_settings().jwt_secret, algorithms=[ALGORITMO], options={"require": ["exp"]}
        )
    except jwt.PyJWTError:
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) else None
