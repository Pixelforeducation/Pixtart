"""Modelos Pydantic de entrada de la API de cursos (ver CONTRATO.md, «Cursos desde PDF»)."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

TipoPregunta = Literal[
    "multiple_choice",
    "true_false",
    "fill_text",
    "fill_code",
    "numeric",
    "ordering",
    "open",
    "math_problem",
    "proof",
]


class ConfigCurso(BaseModel):
    model_config = ConfigDict(extra="forbid")

    titulo: str | None = Field(default=None, max_length=200)
    num_preguntas: int = Field(ge=5, le=200)
    dificultad: int = Field(ge=1, le=5)
    tipos: list[TipoPregunta] = Field(min_length=1)
    instrucciones: str = Field(default="", max_length=2000)
    tiempos_por_tipo: dict[TipoPregunta, int] | None = None
    repaso: Literal["fsrs", "leitner"]
    # Nivel final de cada sección (Q35): número de preguntas N y calificación mínima g en %.
    final_n: int = Field(default=10, ge=3, le=40)
    final_g: int = Field(default=70, ge=60, le=100)

    @field_validator("tipos")
    @classmethod
    def _sin_repetidos(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(v))

    @field_validator("tiempos_por_tipo")
    @classmethod
    def _tiempos(cls, v: dict | None) -> dict | None:
        if v is not None and any(not 5 <= s <= 3600 for s in v.values()):
            raise ValueError("cada tiempo debe estar entre 5 y 3600 segundos")
        return v


class EdicionPregunta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tipo: TipoPregunta | None = None
    enunciado: str | None = Field(default=None, max_length=2000)
    opciones: list[str] | None = None
    respuesta: Any = None
    tolerancia: float | None = None
    explicacion: str | None = Field(default=None, max_length=3000)
    pista: str | None = Field(default=None, max_length=1000)
    dificultad: int | None = Field(default=None, ge=1, le=5)
    tiempo_s: int | None = Field(default=None, ge=5, le=3600)
    fuente_pagina: int | None = None
    fuente_documento: str | None = Field(default=None, max_length=255)


class CuerpoRegenerar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    instruccion: str | None = Field(default=None, max_length=2000)
