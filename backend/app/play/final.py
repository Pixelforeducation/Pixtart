"""Reglas del nivel final (examen con forma de aventura), sin I/O.

Vive en `app/play` (adaptador) para no tocar `app/game`. Decisiones del autor:
- Q35: el usuario fija N ∈ [3, 40] y g ∈ [60, 100] % (config del curso `final_n`, `final_g`).
- Q37: victoria temprana al llegar a `requeridas = ceil(N·g)`; las restantes son bonus.
- Q38/Q106: sin ítems ni mascotas. Q39: sin daño parcial (cada pregunta acierta o falla).
- Q40: gimmick del jefe desde el MVP: fase 2 («furia») con 25 % menos de tiempo por pregunta.
- Derrota inmediata cuando los fallos superan el margen `N − requeridas`.
"""

from __future__ import annotations

import math
from typing import Any

N_MIN, N_MAX, N_POR_DEFECTO = 3, 40, 10
G_MIN, G_MAX, G_POR_DEFECTO = 60, 100, 70
FACTOR_FURIA = 0.75  # tiempo de las preguntas de la fase 2 del jefe
TIEMPO_MIN_FURIA_S = 8


def acotar_n(valor: Any) -> int:
    try:
        n = int(valor)
    except (TypeError, ValueError):
        return N_POR_DEFECTO
    return max(N_MIN, min(N_MAX, n))


def acotar_g(valor: Any) -> int:
    try:
        g = int(valor)
    except (TypeError, ValueError):
        return G_POR_DEFECTO
    return max(G_MIN, min(G_MAX, g))


def requeridas(n: int, g: int) -> int:
    """`ceil(N · g / 100)` en aritmética entera (sin errores de coma flotante)."""
    return -(-n * g // 100)


def preguntas_jefe(n: int) -> int:
    """~35 % de las preguntas para el jefe, mínimo 2 (1 si N < 4)."""
    if n < 4:
        return 1
    return max(2, round(0.35 * n))


def plan_encuentros(n: int) -> list[dict[str, Any]]:
    """Reparte N preguntas en encuentros: comunes (1), raros (2) y el jefe al final.

    Devuelve `[{tipo: "comun"|"raro"|"jefe", desde, cuantas, fase2_desde?}]` con índices
    sobre la lista de preguntas servida. El patrón de la guardia es común, común, raro…
    """
    jefe = preguntas_jefe(n)
    guardia = n - jefe
    encuentros: list[dict[str, Any]] = []
    i = 0
    paso = 0
    while i < guardia:
        raro = paso % 3 == 2 and guardia - i >= 2
        cuantas = 2 if raro else 1
        encuentros.append({"tipo": "raro" if raro else "comun", "desde": i, "cuantas": cuantas})
        i += cuantas
        paso += 1
    fase2 = guardia + math.ceil(jefe / 2) if jefe >= 2 else None
    jefe_enc: dict[str, Any] = {"tipo": "jefe", "desde": guardia, "cuantas": jefe}
    if fase2 is not None:
        jefe_enc["fase2_desde"] = fase2
    encuentros.append(jefe_enc)
    return encuentros


def tiempo_furia(tiempo_s: int) -> int:
    return max(TIEMPO_MIN_FURIA_S, math.floor(tiempo_s * FACTOR_FURIA))


def progreso(entradas: list[dict[str, Any]], requeridas_: int) -> dict[str, Any]:
    """Estado autoritativo del examen a partir de las entradas del intento."""
    n = len(entradas)
    aciertos = sum(1 for e in entradas if e.get("respondida") and e.get("correcta"))
    fallos = sum(1 for e in entradas if e.get("respondida") and not e.get("correcta"))
    restantes = n - aciertos - fallos
    margen = n - requeridas_
    if aciertos >= requeridas_:
        resultado = "victoria"
    elif fallos > margen:  # el aprobado ya no es alcanzable
        resultado = "derrota"
    else:
        resultado = "en_curso"
    return {
        "n": n,
        "requeridas": requeridas_,
        "aciertos": aciertos,
        "fallos": fallos,
        "restantes": restantes,
        "margen": margen,
        "corazones": max(0, margen - fallos),
        "resultado": resultado,
    }
