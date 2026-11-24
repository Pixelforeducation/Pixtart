"""Tablas de la plataforma: usuarios, API keys (BYOK cifradas) y límites/uso de tokens."""

import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, LargeBinary, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


def nuevo_id() -> str:
    return str(uuid.uuid4())


class Usuario(TimestampMixin, Base):
    __tablename__ = "usuarios"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=nuevo_id)
    # Siempre en minúsculas (lo normaliza app.auth.service).
    correo: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    hash_contrasena: Mapped[str] = mapped_column(String(255))
    fecha_nacimiento: Mapped[date] = mapped_column(Date)
    zona_horaria: Mapped[str] = mapped_column(String(64), default="UTC")


class ApiKey(TimestampMixin, Base):
    """Key de proveedor con cifrado envolvente: `ciphertext` = Fernet(DEK, key) y
    `dek_cifrada` = Fernet(MASTER_KEY, usuario_id + DEK). Nunca se guarda en claro."""

    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=nuevo_id)
    usuario_id: Mapped[str] = mapped_column(
        ForeignKey("usuarios.id", ondelete="CASCADE"), index=True
    )
    proveedor: Mapped[str] = mapped_column(String(32))
    modelo: Mapped[str] = mapped_column(String(128))
    ciphertext: Mapped[bytes] = mapped_column(LargeBinary)
    dek_cifrada: Mapped[bytes] = mapped_column(LargeBinary)
    ultimos4: Mapped[str] = mapped_column(String(4))
    estado: Mapped[str] = mapped_column(String(16), default="activa")  # activa | invalida


class LimitesUso(Base):
    __tablename__ = "limites_uso"

    usuario_id: Mapped[str] = mapped_column(
        ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True
    )
    tope_diario_tokens: Mapped[int] = mapped_column(Integer)
    tope_mensual_tokens: Mapped[int] = mapped_column(Integer)


class UsoTokens(Base):
    """Tokens consumidos por día (fecha local del usuario)."""

    __tablename__ = "uso_tokens"
    __table_args__ = (UniqueConstraint("usuario_id", "fecha"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usuario_id: Mapped[str] = mapped_column(
        ForeignKey("usuarios.id", ondelete="CASCADE"), index=True
    )
    fecha: Mapped[date] = mapped_column(Date)
    tokens_entrada: Mapped[int] = mapped_column(Integer, default=0)
    tokens_salida: Mapped[int] = mapped_column(Integer, default=0)
