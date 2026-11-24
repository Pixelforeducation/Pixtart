"""Paletas de color (add-palette-system D3/D5): se desbloquean por `xp_color`.

Fuente de verdad: `data/palettes.json` (copia de `design/mockups/07-palettes/palettes.json`).
`gris` (umbral 0) siempre está desbloqueada.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any

RUTA_PALETAS = Path(__file__).parent / "data" / "palettes.json"


@dataclass(frozen=True, slots=True)
class Paleta:
    id: str
    nombre: str
    xp_color_min: int
    swap: tuple[tuple[str, str], ...] = ()


@cache
def datos_paletas() -> dict[str, Any]:
    with RUTA_PALETAS.open(encoding="utf-8") as f:
        return json.load(f)


@cache
def paletas() -> tuple[Paleta, ...]:
    """Las paletas ordenadas por umbral ascendente."""
    lista = [
        Paleta(
            id=p["id"],
            nombre=p["nombre"],
            xp_color_min=int(p["xp_color_min"]),
            swap=tuple(sorted((p.get("swap") or {}).items())),
        )
        for p in datos_paletas()["paletas"]
    ]
    return tuple(sorted(lista, key=lambda p: p.xp_color_min))


def paleta(id_paleta: str) -> Paleta:
    for p in paletas():
        if p.id == id_paleta:
            return p
    raise KeyError(id_paleta)


def decaimiento_por_dia() -> int:
    return int(datos_paletas()["xp_decaimiento_por_dia"])


def desbloqueadas(xp_color: int) -> list[str]:
    """Ids desbloqueados con ese `xp_color` (orden de umbral). La de umbral 0 siempre."""
    return [p.id for p in paletas() if p.xp_color_min <= max(0, xp_color)]


def mejor_desbloqueada(xp_color: int) -> str:
    return desbloqueadas(xp_color)[-1]


def paleta_efectiva(xp_color: int, preferida: str | None) -> str:
    """La preferida si está desbloqueada; si no, la de mayor umbral desbloqueada."""
    disponibles = desbloqueadas(xp_color)
    if preferida in disponibles:
        return preferida
    return disponibles[-1]


def siguiente_paleta(xp_color: int) -> Paleta | None:
    """La próxima paleta por desbloquear (para la barra de progreso), o None si ya están todas."""
    for p in paletas():
        if p.xp_color_min > xp_color:
            return p
    return None
