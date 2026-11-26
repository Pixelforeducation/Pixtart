"""Tablas del juego (agente juego-api): estado del jugador, intentos, cofres, niveles y repaso.

Los estados de `app/game` (EstadoProgreso, EstadoVidas, EstadoCofres, EstadoTarjeta) se guardan
como JSON; `app/play/serial.py` los (de)serializa. Al modificar una columna JSON se reasigna el
valor completo para que SQLAlchemy detecte el cambio.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


def _id() -> str:
    return str(uuid.uuid4())


class EstadoJugador(TimestampMixin, Base):
    """Una fila por usuario con todos sus contadores de juego."""

    __tablename__ = "juego_estado"

    usuario_id: Mapped[str] = mapped_column(
        ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True
    )
    progreso: Mapped[dict[str, Any]] = mapped_column(JSON)  # EstadoProgreso
    vidas: Mapped[dict[str, Any]] = mapped_column(JSON)  # EstadoVidas
    cofres: Mapped[dict[str, Any]] = mapped_column(JSON)  # EstadoCofres (ciclo y pity)
    monedas: Mapped[int] = mapped_column(Integer, default=0)
    inventario: Mapped[dict[str, int]] = mapped_column(JSON, default=dict)  # item_id → cantidad
    mascotas: Mapped[list[str]] = mapped_column(JSON, default=list)  # ids de mascotas poseídas
    paleta_preferida: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # v0.3: {minimo_aprobar, equipo: {arma, armadura, ropa}, evoluciones: {mascota_id: {xp,
    # racha_sin_ayuda}}}. Nullable: las filas viejas se leen con valores por defecto.
    extras: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)


class CofrePendiente(TimestampMixin, Base):
    __tablename__ = "juego_cofres"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    usuario_id: Mapped[str] = mapped_column(
        ForeignKey("usuarios.id", ondelete="CASCADE"), index=True
    )
    tipo: Mapped[str] = mapped_column(String(16))  # normal | legendario
    # Nivel tras el que se ganó (para dibujarlo en el camino).
    curso_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    nivel_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    abierto: Mapped[bool] = mapped_column(Boolean, default=False)


class IntentoNivel(TimestampMixin, Base):
    """Una partida de un nivel.

    `preguntas`: lista de dicts `{pregunta_id, nivel_id, tiempo_s, respondida, correcta, timeout,
    ayudas_dadas: [int], respuesta}` en el orden servido. v0.3 añade a cada entrada
    `xp_ganada` y `ayuda_pedida` (al responder), `pausada_en` (ISO; solo en la pregunta en
    curso mientras la partida está pausada) y en la primera entrada `aprobado` (al terminar)
    y `reintento` (si se sirvió como reintento). `reloj_desde` es el instante (servidor)
    desde el que corre el tiempo de la pregunta en curso: el inicio o la última respuesta.
    `segundos_extra` es tiempo añadido a la pregunta en curso (poción de tiempo).
    """

    __tablename__ = "juego_intentos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    usuario_id: Mapped[str] = mapped_column(
        ForeignKey("usuarios.id", ondelete="CASCADE"), index=True
    )
    curso_id: Mapped[str] = mapped_column(String(64), index=True)
    nivel_id: Mapped[str] = mapped_column(String(64), index=True)
    tema: Mapped[str] = mapped_column(String(255))
    # en_curso | terminado | abandonado
    estado: Mapped[str] = mapped_column(String(16), default="en_curso")
    calentamiento: Mapped[bool] = mapped_column(Boolean, default=False)
    es_final: Mapped[bool] = mapped_column(Boolean, default=False)
    es_jefe: Mapped[bool] = mapped_column(Boolean, default=False)
    repetido: Mapped[bool] = mapped_column(Boolean, default=False)
    preguntas: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    reloj_desde: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    segundos_extra: Mapped[int] = mapped_column(Integer, default=0)
    xp_ganada: Mapped[int] = mapped_column(Integer, default=0)


class NivelCompletado(TimestampMixin, Base):
    __tablename__ = "juego_niveles_completados"
    __table_args__ = (UniqueConstraint("usuario_id", "nivel_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usuario_id: Mapped[str] = mapped_column(
        ForeignKey("usuarios.id", ondelete="CASCADE"), index=True
    )
    curso_id: Mapped[str] = mapped_column(String(64), index=True)
    nivel_id: Mapped[str] = mapped_column(String(64))
    perfecto: Mapped[bool] = mapped_column(Boolean, default=False)


class TarjetaRepaso(Base):
    """Estado de repaso (Leitner) y última vez vista de (usuario, pregunta)."""

    __tablename__ = "juego_tarjetas"
    __table_args__ = (UniqueConstraint("usuario_id", "pregunta_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usuario_id: Mapped[str] = mapped_column(
        ForeignKey("usuarios.id", ondelete="CASCADE"), index=True
    )
    curso_id: Mapped[str] = mapped_column(String(64), index=True)
    nivel_id: Mapped[str] = mapped_column(String(64))
    pregunta_id: Mapped[str] = mapped_column(String(64))
    vista_en: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    tarjeta: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)  # EstadoTarjeta
