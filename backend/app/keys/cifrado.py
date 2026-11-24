"""Cifrado envolvente de API keys con Fernet.

- Cada key tiene su propia DEK (clave Fernet aleatoria): `ciphertext = Fernet(DEK).encrypt(key)`.
- La DEK se guarda cifrada con la MASTER_KEY, ligada al usuario:
  `dek_cifrada = Fernet(MASTER_KEY).encrypt(usuario_id + ":" + DEK)`. Así un texto cifrado copiado
  a la fila de otro usuario no descifra.
"""

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings


class ErrorCifrado(Exception):
    pass


def _maestra() -> Fernet:
    clave = get_settings().master_key
    if not clave:
        raise ErrorCifrado("MASTER_KEY no está configurada.")
    try:
        return Fernet(clave.encode())
    except (ValueError, TypeError) as e:
        raise ErrorCifrado("MASTER_KEY no es una clave Fernet válida.") from e


def cifrar(usuario_id: str, secreto: str) -> tuple[bytes, bytes]:
    """Devuelve `(ciphertext, dek_cifrada)`."""
    dek = Fernet.generate_key()
    ciphertext = Fernet(dek).encrypt(secreto.encode())
    dek_cifrada = _maestra().encrypt(usuario_id.encode() + b":" + dek)
    return ciphertext, dek_cifrada


def descifrar(usuario_id: str, ciphertext: bytes, dek_cifrada: bytes) -> str:
    try:
        contenido = _maestra().decrypt(dek_cifrada)
        dueno, _, dek = contenido.partition(b":")
        if dueno != usuario_id.encode() or not dek:
            raise ErrorCifrado("La key no pertenece a este usuario.")
        return Fernet(dek).decrypt(ciphertext).decode()
    except InvalidToken as e:
        raise ErrorCifrado("No se pudo descifrar la key.") from e
