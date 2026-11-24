"""Lógica de cuentas: validación de registro, alta y autenticación."""

import re
from datetime import date
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.seguridad import hashear_contrasena, verificar_contrasena
from app.models.usuarios import Usuario

EDAD_MINIMA = 18
LONGITUD_MINIMA_CONTRASENA = 10
_PATRON_CORREO = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# Hash fijo para gastar el mismo tiempo cuando el correo no existe (evita enumerar cuentas).
_HASH_SEÑUELO = hashear_contrasena("contrasena-senuelo-pixtart")


class ErrorRegistro(Exception):
    """Error de validación con mensaje en español para el usuario."""

    def __init__(self, mensaje: str, conflicto: bool = False):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.conflicto = conflicto


def normalizar_correo(correo: str) -> str:
    return correo.strip().lower()


def edad_en(fecha_nacimiento: date, hoy: date) -> int:
    cumplio = (hoy.month, hoy.day) >= (fecha_nacimiento.month, fecha_nacimiento.day)
    return hoy.year - fecha_nacimiento.year - (0 if cumplio else 1)


def validar_registro(
    correo: str, contrasena: str, fecha_nacimiento: date, zona_horaria: str, hoy: date
) -> None:
    if not _PATRON_CORREO.match(correo):
        raise ErrorRegistro("El correo no tiene un formato válido.")
    if len(contrasena) < LONGITUD_MINIMA_CONTRASENA:
        raise ErrorRegistro(
            f"La contraseña debe tener al menos {LONGITUD_MINIMA_CONTRASENA} caracteres."
        )
    if fecha_nacimiento > hoy:
        raise ErrorRegistro("La fecha de nacimiento no puede estar en el futuro.")
    if edad_en(fecha_nacimiento, hoy) < EDAD_MINIMA:
        raise ErrorRegistro(f"Debes tener al menos {EDAD_MINIMA} años para registrarte.")
    try:
        ZoneInfo(zona_horaria)
    except (ZoneInfoNotFoundError, ValueError):
        raise ErrorRegistro("La zona horaria no es válida (ejemplo: America/Mexico_City).")


def registrar(
    db: Session,
    correo: str,
    contrasena: str,
    fecha_nacimiento: date,
    zona_horaria: str,
    hoy: date,
) -> Usuario:
    correo = normalizar_correo(correo)
    validar_registro(correo, contrasena, fecha_nacimiento, zona_horaria, hoy)
    duplicado = ErrorRegistro("Ya existe una cuenta con ese correo.", conflicto=True)
    if db.scalar(select(Usuario).where(Usuario.correo == correo)) is not None:
        raise duplicado
    usuario = Usuario(
        correo=correo,
        hash_contrasena=hashear_contrasena(contrasena),
        fecha_nacimiento=fecha_nacimiento,
        zona_horaria=zona_horaria,
    )
    db.add(usuario)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise duplicado
    return usuario


def autenticar(db: Session, correo: str, contrasena: str) -> Usuario | None:
    usuario = db.scalar(select(Usuario).where(Usuario.correo == normalizar_correo(correo)))
    if usuario is None:
        verificar_contrasena(_HASH_SEÑUELO, contrasena)
        return None
    if not verificar_contrasena(usuario.hash_contrasena, contrasena):
        return None
    return usuario
