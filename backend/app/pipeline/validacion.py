"""Validación de preguntas generadas y tiempo por defecto.

No descarta nada: marca `valida` y `problemas` para que el autor revise y corrija.
"""

import math
import re
import unicodedata
from typing import Any

from app.pipeline.prompts import TIPOS

# Fórmula de add-question-bank/design.md §5:
#   T = clamp(base_tipo × f_diff + palabras/3.3 + 1.5, T_min_tipo, 120)
# TODO(integración): unificar con app/game/tiempo.py (agente reglas) cuando exista.
_BASE_Y_MIN = {
    "true_false": (8, 6),
    "multiple_choice": (15, 8),
    "fill_text": (20, 10),  # supuesto: texto corto, entre MC y código
    "fill_code": (25, 12),
    "numeric": (30, 15),  # supuesto: como predict_output
    "ordering": (40, 20),  # = parsons
    "open": (60, 30),  # supuesto; se corrige por autoevaluación
}
_F_DIFF = {1: 0.8, 2: 1.0, 3: 1.25, 4: 1.5, 5: 1.8}
_TOPE = 120
TIEMPO_LARGO = {"math_problem": 900, "proof": 900}  # 15 min (decisión Q24)


def tiempo_por_defecto(
    tipo: str, dificultad: int, enunciado: str, tiempos_por_tipo: dict | None = None
) -> int:
    """Delegado a la fuente única de verdad: app.game.tiempo.tiempo_limite."""
    from app.game.tiempo import tiempo_limite

    overrides = {k: v for k, v in (tiempos_por_tipo or {}).items() if v}
    return tiempo_limite(
        tipo, min(5, max(1, int(dificultad or 3))), enunciado or "", tiempos_por_tipo=overrides
    )


def normalizar(texto: str) -> str:
    t = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()


def _es_entero(v: Any) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def _es_numero(v: Any) -> bool:
    return isinstance(v, int | float) and not isinstance(v, bool) and math.isfinite(v)


_SOSPECHOSO = re.compile(r"<\s*/?\s*[a-z][^>]*>|https?://|www\.", re.I)


def problemas_pregunta(p: dict, tipos_permitidos: list[str] | None = None) -> list[str]:
    """Problemas de una pregunta (dict con los campos del contrato). Vacío = válida."""
    probs: list[str] = []
    tipo = p.get("tipo")
    enunciado = p.get("enunciado") or ""
    opciones = p.get("opciones")
    r = p.get("respuesta")

    if tipo not in TIPOS:
        return [f"tipo desconocido: {tipo}"]
    if tipos_permitidos and tipo not in tipos_permitidos:
        probs.append("tipo no solicitado en la configuración")
    if not enunciado.strip():
        probs.append("enunciado vacío")
    if not (p.get("explicacion") or "").strip():
        probs.append("explicación vacía")
    dif = p.get("dificultad")
    if not _es_entero(dif) or not 1 <= dif <= 5:
        probs.append("dificultad fuera de 1-5")
    textos = [enunciado, p.get("explicacion") or "", p.get("pista") or ""]
    if isinstance(opciones, list):
        textos += [o for o in opciones if isinstance(o, str)]
    if any(_SOSPECHOSO.search(t) for t in textos):
        probs.append("contiene HTML o enlaces")

    if tipo in ("multiple_choice", "ordering"):
        minimo = 3 if tipo == "multiple_choice" else 2
        if not isinstance(opciones, list) or not all(isinstance(o, str) for o in opciones):
            probs.append("faltan opciones")
            opciones = []
        else:
            if len(opciones) < minimo:
                probs.append(f"se necesitan al menos {minimo} opciones")
            norm = [normalizar(o) for o in opciones]
            if any(not n for n in norm):
                probs.append("hay opciones vacías")
            if len(set(norm)) != len(norm):
                probs.append("opciones repetidas")
        if tipo == "multiple_choice":
            if not _es_entero(r) or not 0 <= r < len(opciones):
                probs.append("la respuesta no es un índice válido de opción")
        else:
            if (
                not isinstance(r, list)
                or not all(_es_entero(x) for x in r)
                or sorted(r) != list(range(len(opciones)))
            ):
                probs.append("la respuesta no es una permutación de las opciones")
    elif tipo == "true_false":
        if not isinstance(r, bool):
            probs.append("la respuesta debe ser verdadero o falso")
    elif tipo in ("fill_text", "fill_code"):
        if (
            not isinstance(r, list)
            or not r
            or not all(isinstance(x, str) and x.strip() for x in r)
        ):
            probs.append("se necesita al menos una respuesta aceptada")
    elif tipo == "numeric":
        if not _es_numero(r):
            probs.append("la respuesta debe ser un número")
        tol = p.get("tolerancia")
        if not _es_numero(tol) or tol < 0:
            probs.append("la tolerancia debe ser un número ≥ 0")
    else:  # open, math_problem, proof
        if not isinstance(r, str) or not r.strip():
            probs.append("falta el texto de referencia")
    return probs


def validar_lote(preguntas: list[dict], tipos_permitidos: list[str] | None = None) -> list[list[str]]:
    """Problemas de cada pregunta, incluidos duplicados por enunciado normalizado
    (la segunda y siguientes apariciones se marcan)."""
    vistos: set[str] = set()
    salida = []
    for p in preguntas:
        probs = problemas_pregunta(p, tipos_permitidos)
        clave = normalizar(p.get("enunciado") or "")
        if clave:
            if clave in vistos:
                probs.append("pregunta duplicada")
            vistos.add(clave)
        salida.append(probs)
    return salida
