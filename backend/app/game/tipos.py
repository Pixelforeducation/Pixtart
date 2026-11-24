"""Tipos compartidos por las reglas del juego (sin I/O).

Los nombres siguen `app/api/CONTRATO.md`: `TipoPregunta`, `Pregunta` y las rarezas
`comun | rara | legendaria`.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Any


class TipoPregunta(StrEnum):
    MULTIPLE_CHOICE = "multiple_choice"
    TRUE_FALSE = "true_false"
    FILL_TEXT = "fill_text"
    FILL_CODE = "fill_code"
    NUMERIC = "numeric"
    ORDERING = "ordering"
    OPEN = "open"
    MATH_PROBLEM = "math_problem"
    PROOF = "proof"


#: Tipos que no se corrigen solos: el jugador se autoevalúa (o pide feedback con IA).
TIPOS_ABIERTOS = frozenset({TipoPregunta.OPEN, TipoPregunta.MATH_PROBLEM, TipoPregunta.PROOF})
TIPOS_FILL = frozenset({TipoPregunta.FILL_TEXT, TipoPregunta.FILL_CODE})
TIPOS_OPCIONES = frozenset({TipoPregunta.MULTIPLE_CHOICE, TipoPregunta.TRUE_FALSE})


class Rareza(StrEnum):
    COMUN = "comun"
    RARA = "rara"
    LEGENDARIA = "legendaria"


class AccionInvalida(ValueError):
    """La acción no se puede aplicar al estado actual (la capa HTTP la traduce a 409)."""


@dataclass(frozen=True, slots=True)
class Pregunta:
    """Vista mínima de una pregunta que necesitan las reglas.

    `respuesta` según tipo: MC → índice (int); VF → bool; fill_* → tupla de textos aceptados;
    numeric → número (+ `tolerancia`); ordering → tupla de índices en orden correcto;
    open/math_problem/proof → texto de referencia.
    Convención V/F: opciones `[Verdadero, Falso]`, es decir índice 0 = True y 1 = False.
    """

    id: str
    tipo: TipoPregunta
    enunciado: str
    respuesta: Any
    opciones: tuple[str, ...] = ()
    tolerancia: float | None = None
    dificultad: int = 3
    pista: str | None = None

    @classmethod
    def desde_dict(cls, d: Mapping[str, Any]) -> Pregunta:
        """Construye desde el JSON del contrato (`Pregunta`)."""
        tipo = TipoPregunta(d["tipo"])
        respuesta = d["respuesta"]
        if isinstance(respuesta, list):
            respuesta = tuple(respuesta)
        return cls(
            id=str(d["id"]),
            tipo=tipo,
            enunciado=d.get("enunciado", ""),
            respuesta=respuesta,
            opciones=tuple(d.get("opciones") or ()),
            tolerancia=d.get("tolerancia"),
            dificultad=int(d.get("dificultad", 3)),
            pista=d.get("pista"),
        )
