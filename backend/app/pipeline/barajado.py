"""Baraja las opciones de las preguntas generadas para que su orden no revele la respuesta.

El LLM suele escribir los pasos de `ordering` ya en orden correcto y la opción correcta de
`multiple_choice` en la misma posición. Se baraja con una semilla derivada del enunciado,
así el resultado es determinista (reintentos idempotentes, tests reproducibles).
"""

import hashlib
import random
from typing import Any


def _rng(d: dict) -> random.Random:
    semilla = hashlib.sha256((d.get("enunciado") or "").encode()).digest()[:8]
    return random.Random(int.from_bytes(semilla, "big"))


def _permutacion(n: int, rng: random.Random, evitar_identidad: bool) -> list[int]:
    perm = list(range(n))
    rng.shuffle(perm)
    if evitar_identidad and n > 1 and perm == list(range(n)):
        perm = perm[1:] + perm[:1]
    return perm


def barajar(d: dict[str, Any]) -> dict[str, Any]:
    """Devuelve una copia de la pregunta (dict con campos del contrato) con opciones barajadas.

    Si la forma no es la esperada (la validación la marcará), la devuelve sin cambios.
    """
    opciones, resp, tipo = d.get("opciones"), d.get("respuesta"), d.get("tipo")
    if not isinstance(opciones, list) or len(opciones) < 2:
        return d
    n = len(opciones)
    if tipo == "multiple_choice":
        if not isinstance(resp, int) or isinstance(resp, bool) or not 0 <= resp < n:
            return d
        perm = _permutacion(n, _rng(d), evitar_identidad=False)  # perm[nuevo] = viejo
        return {**d, "opciones": [opciones[i] for i in perm], "respuesta": perm.index(resp)}
    if tipo == "ordering":
        if not isinstance(resp, list) or sorted(resp) != list(range(n)):
            return d
        perm = _permutacion(n, _rng(d), evitar_identidad=True)
        nueva_pos = {viejo: nuevo for nuevo, viejo in enumerate(perm)}
        return {
            **d,
            "opciones": [opciones[i] for i in perm],
            "respuesta": [nueva_pos[i] for i in resp],
        }
    return d
