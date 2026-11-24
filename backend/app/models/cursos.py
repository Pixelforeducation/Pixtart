"""Tablas del pipeline: cursos generados desde PDF (agente pipeline).

`usuario_id` es String(36) como `usuarios.id` de plataforma. No se declara FK para no depender
del orden de integración; se puede añadir en la migración de Alembic.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, utcnow


def nuevo_id() -> str:
    return str(uuid.uuid4())


class Curso(TimestampMixin, Base):
    __tablename__ = "cursos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=nuevo_id)
    usuario_id: Mapped[str] = mapped_column(String(36), index=True)
    titulo: Mapped[str] = mapped_column(String(200))
    tema: Mapped[str] = mapped_column(String(200), default="")
    estado: Mapped[str] = mapped_column(String(20), default="borrador")  # borrador|publicado
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    secciones: Mapped[list["Seccion"]] = relationship(
        back_populates="curso", cascade="all, delete-orphan", order_by="Seccion.orden"
    )


class Seccion(Base):
    __tablename__ = "secciones"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=nuevo_id)
    curso_id: Mapped[str] = mapped_column(ForeignKey("cursos.id", ondelete="CASCADE"), index=True)
    titulo: Mapped[str] = mapped_column(String(200))
    orden: Mapped[int] = mapped_column(Integer)

    curso: Mapped[Curso] = relationship(back_populates="secciones")
    niveles: Mapped[list["Nivel"]] = relationship(
        back_populates="seccion", cascade="all, delete-orphan", order_by="Nivel.orden"
    )


class Nivel(Base):
    __tablename__ = "niveles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=nuevo_id)
    seccion_id: Mapped[str] = mapped_column(
        ForeignKey("secciones.id", ondelete="CASCADE"), index=True
    )
    titulo: Mapped[str] = mapped_column(String(200))
    orden: Mapped[int] = mapped_column(Integer)
    es_calentamiento: Mapped[bool] = mapped_column(Boolean, default=False)
    # Resumen generado por la IA: sirve para regenerar preguntas cuando el PDF ya se borró.
    resumen: Mapped[str] = mapped_column(Text, default="")
    pagina_inicio: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pagina_fin: Mapped[int | None] = mapped_column(Integer, nullable=True)

    seccion: Mapped[Seccion] = relationship(back_populates="niveles")
    preguntas: Mapped[list["Pregunta"]] = relationship(
        back_populates="nivel", cascade="all, delete-orphan", order_by="Pregunta.orden"
    )


class Pregunta(TimestampMixin, Base):
    __tablename__ = "preguntas"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=nuevo_id)
    nivel_id: Mapped[str] = mapped_column(ForeignKey("niveles.id", ondelete="CASCADE"), index=True)
    orden: Mapped[int] = mapped_column(Integer, default=0)
    tipo: Mapped[str] = mapped_column(String(30))
    enunciado: Mapped[str] = mapped_column(Text)
    opciones: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    respuesta: Mapped[Any] = mapped_column(JSON)
    tolerancia: Mapped[float | None] = mapped_column(Float, nullable=True)
    explicacion: Mapped[str] = mapped_column(Text, default="")
    pista: Mapped[str | None] = mapped_column(Text, nullable=True)
    dificultad: Mapped[int] = mapped_column(Integer, default=3)
    tiempo_s: Mapped[int] = mapped_column(Integer, default=30)
    tiempo_manual: Mapped[bool] = mapped_column(Boolean, default=False)
    fuente_pagina: Mapped[int | None] = mapped_column(Integer, nullable=True)
    valida: Mapped[bool] = mapped_column(Boolean, default=False)
    problemas: Mapped[list[str]] = mapped_column(JSON, default=list)

    nivel: Mapped[Nivel] = relationship(back_populates="preguntas")


class Trabajo(TimestampMixin, Base):
    __tablename__ = "trabajos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=nuevo_id)
    usuario_id: Mapped[str] = mapped_column(String(36), index=True)
    curso_id: Mapped[str] = mapped_column(ForeignKey("cursos.id", ondelete="CASCADE"), index=True)
    tipo: Mapped[str] = mapped_column(String(20), default="generar")  # generar|regenerar
    # subiendo|leyendo|ocr|analizando|generando|validando|listo|error
    estado: Mapped[str] = mapped_column(String(20), default="subiendo")
    progreso: Mapped[int] = mapped_column(Integer, default=0)
    mensaje: Mapped[str] = mapped_column(Text, default="")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # generar: {"estructura": ...} (checkpoint); regenerar: {"pregunta_id", "instruccion"}
    datos: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    tokens_entrada: Mapped[int] = mapped_column(Integer, default=0)
    tokens_salida: Mapped[int] = mapped_column(Integer, default=0)
    actualizado: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class Documento(TimestampMixin, Base):
    __tablename__ = "documentos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=nuevo_id)
    usuario_id: Mapped[str] = mapped_column(String(36), index=True)
    curso_id: Mapped[str] = mapped_column(ForeignKey("cursos.id", ondelete="CASCADE"), index=True)
    nombre: Mapped[str] = mapped_column(String(255), default="")
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    tamano: Mapped[int] = mapped_column(Integer)
    paginas: Mapped[int] = mapped_column(Integer)
    ruta: Mapped[str] = mapped_column(String(500))  # clave en el almacén (MinIO)
    borrado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
