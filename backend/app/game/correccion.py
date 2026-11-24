"""Corrección determinista por tipo de pregunta.

MC → índice; VF → bool; fill_text → texto normalizado (mayúsculas, espacios y, opcionalmente,
acentos); fill_code → igual pero distingue mayúsculas; numeric → |x − r| ≤ tolerancia;
ordering → lista exacta; open/math_problem/proof → `AUTOEVALUAR` (el jugador se autoevalúa).
Una respuesta mal formada es incorrecta, nunca un error.
"""

from __future__ import annotations

import math
import unicodedata
from enum import StrEnum
from typing import Any

from app.game.tipos import TIPOS_ABIERTOS, Pregunta, TipoPregunta

T = TipoPregunta
EPSILON_NUMERICO = 1e-9


class Correccion(StrEnum):
    CORRECTA = "correcta"
    INCORRECTA = "incorrecta"
    AUTOEVALUAR = "autoevaluar"


def _ok(cond: bool) -> Correccion:
    return Correccion.CORRECTA if cond else Correccion.INCORRECTA


def quitar_acentos(texto: str) -> str:
    descompuesto = unicodedata.normalize("NFD", texto)
    return "".join(c for c in descompuesto if unicodedata.category(c) != "Mn")


def normalizar(texto: str, *, mayusculas: bool = True, acentos: bool = False) -> str:
    """Colapsa espacios; `mayusculas=True` ignora mayúsculas; `acentos=True` ignora acentos."""
    t = " ".join(unicodedata.normalize("NFC", texto).split())
    if mayusculas:
        t = t.casefold()
    if acentos:
        t = quitar_acentos(t)
    return t


def _es_entero(x: Any) -> bool:
    return isinstance(x, int) and not isinstance(x, bool)


def _a_numero(x: Any) -> float | None:
    if isinstance(x, bool):
        return None
    if isinstance(x, (int, float)):
        v = float(x)
    elif isinstance(x, str):
        try:
            v = float(x.strip().replace(" ", "").replace(",", "."))
        except ValueError:
            return None
    else:
        return None
    return v if math.isfinite(v) else None


def corregir(
    pregunta: Pregunta, respuesta: Any, *, ignorar_acentos: bool = False
) -> Correccion:
    tipo = pregunta.tipo
    if tipo in TIPOS_ABIERTOS:
        return Correccion.AUTOEVALUAR
    if tipo is T.MULTIPLE_CHOICE:
        return _ok(_es_entero(respuesta) and respuesta == int(pregunta.respuesta))
    if tipo is T.TRUE_FALSE:
        return _ok(isinstance(respuesta, bool) and respuesta is bool(pregunta.respuesta))
    if tipo in (T.FILL_TEXT, T.FILL_CODE):
        if not isinstance(respuesta, str):
            return Correccion.INCORRECTA
        mayus = tipo is T.FILL_TEXT
        dada = normalizar(respuesta, mayusculas=mayus, acentos=ignorar_acentos)
        aceptadas = {
            normalizar(str(a), mayusculas=mayus, acentos=ignorar_acentos)
            for a in pregunta.respuesta
        }
        return _ok(bool(dada) and dada in aceptadas)
    if tipo is T.NUMERIC:
        v = _a_numero(respuesta)
        if v is None:
            return Correccion.INCORRECTA
        tol = max(float(pregunta.tolerancia or 0), 0.0)
        return _ok(abs(v - float(pregunta.respuesta)) <= tol + EPSILON_NUMERICO)
    if tipo is T.ORDERING:
        if not isinstance(respuesta, (list, tuple)) or not all(map(_es_entero, respuesta)):
            return Correccion.INCORRECTA
        return _ok(list(respuesta) == [int(x) for x in pregunta.respuesta])
    raise ValueError(f"tipo no soportado: {tipo}")  # pragma: no cover


def autoevaluar(pregunta: Pregunta, la_acerte: bool) -> Correccion:
    """Resultado de una pregunta abierta según la autoevaluación del jugador."""
    if pregunta.tipo not in TIPOS_ABIERTOS:
        raise ValueError("solo las preguntas abiertas se autoevalúan")
    return _ok(la_acerte)
