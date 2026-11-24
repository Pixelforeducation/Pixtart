"""Tiempo límite por pregunta (question-bank §5 + decisiones Q24 y Q36).

    T = clamp(base_tipo × f_diff + palabras / 3.3 + 1.5, T_min_tipo, 120)

`math_problem` y `proof` no usan la fórmula: 900 s (15 min) por defecto. El autor del curso
puede fijar el tiempo de cualquier tipo con `tiempos_por_tipo` (config del curso).
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence

from app.game.tipos import TipoPregunta

T = TipoPregunta

#: (base_tipo, T_min) en segundos.
TABLA_TIPOS: dict[TipoPregunta, tuple[float, float]] = {
    T.TRUE_FALSE: (8, 6),
    T.MULTIPLE_CHOICE: (15, 8),
    T.FILL_TEXT: (20, 10),
    T.FILL_CODE: (25, 12),
    T.NUMERIC: (25, 12),
    T.ORDERING: (40, 20),  # = parsons
    T.OPEN: (120, 60),
}

#: Tipos de tiempo largo (no usan fórmula ni modo extendido).
TIEMPO_LARGO: dict[TipoPregunta, int] = {T.MATH_PROBLEM: 900, T.PROOF: 900}

F_DIFF = {1: 0.8, 2: 1.0, 3: 1.25, 4: 1.5, 5: 1.8}
T_MAX = 120
PALABRAS_POR_SEGUNDO = 3.3
MARGEN_S = 1.5

EXTENDIDO_FACTOR = 1.5
EXTENDIDO_TOPE = 180

RECALIBRAR_MIN_CORRECTAS = 50
RECALIBRAR_FACTOR = 1.15


def contar_palabras(texto: str) -> int:
    return len(texto.split())


def tiempo_formula(tipo: TipoPregunta | str, dificultad: int, enunciado: str) -> float:
    """Tiempo de la fórmula §5 (sin redondear). Falla para tipos de tiempo largo."""
    tipo = TipoPregunta(tipo)
    if tipo not in TABLA_TIPOS:
        raise ValueError(f"{tipo} no usa la fórmula de tiempo")
    base, t_min = TABLA_TIPOS[tipo]
    f = F_DIFF[min(5, max(1, int(dificultad)))]
    bruto = base * f + contar_palabras(enunciado) / PALABRAS_POR_SEGUNDO + MARGEN_S
    return min(max(bruto, t_min), T_MAX)


def percentil(valores: Sequence[float], p: float) -> float:
    """Percentil con interpolación lineal (como `numpy.percentile` por defecto)."""
    if not valores:
        raise ValueError("sin valores")
    orden = sorted(valores)
    k = (len(orden) - 1) * p / 100
    i = math.floor(k)
    j = min(i + 1, len(orden) - 1)
    return orden[i] + (orden[j] - orden[i]) * (k - i)


def recalibrar(t_formula: float, tiempos_correctas_s: Sequence[float]) -> float:
    """Con ≥ 50 respuestas correctas: 0.5·T_fórmula + 0.5·(p80 × 1.15). Si no, T_fórmula."""
    if len(tiempos_correctas_s) < RECALIBRAR_MIN_CORRECTAS:
        return t_formula
    t_emp = percentil(tiempos_correctas_s, 80) * RECALIBRAR_FACTOR
    return 0.5 * t_formula + 0.5 * t_emp


def aplicar_extendido(t: float) -> float:
    """×1.5 con tope 180 s; nunca reduce un tiempo que ya supera el tope."""
    return max(t, min(t * EXTENDIDO_FACTOR, EXTENDIDO_TOPE))


def tiempo_limite(
    tipo: TipoPregunta | str,
    dificultad: int = 3,
    enunciado: str = "",
    *,
    tiempos_por_tipo: Mapping[str, float] | None = None,
    extendido: bool = False,
    tiempos_correctas_s: Sequence[float] = (),
) -> int:
    """Segundos (enteros, redondeo hacia arriba) para responder una pregunta.

    Prioridad: override del curso (`tiempos_por_tipo`) > tiempo largo (math/proof) >
    fórmula (recalibrada con p80 si hay datos). El modo extendido no aplica a math/proof.
    """
    tipo = TipoPregunta(tipo)
    overrides = {TipoPregunta(k): float(v) for k, v in (tiempos_por_tipo or {}).items()}
    if tipo in overrides:
        if overrides[tipo] <= 0:
            raise ValueError("el tiempo por tipo debe ser positivo")
        t = overrides[tipo]
    elif tipo in TIEMPO_LARGO:
        t = TIEMPO_LARGO[tipo]
    else:
        t = recalibrar(tiempo_formula(tipo, dificultad, enunciado), tiempos_correctas_s)
    if extendido and tipo not in TIEMPO_LARGO:
        t = aplicar_extendido(t)
    return math.ceil(round(t, 6))
