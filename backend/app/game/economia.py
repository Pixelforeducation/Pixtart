"""Simulación Monte Carlo de la economía y precios de la tienda (Q16, Q17).

Supuesto: ~1 nivel nuevo cada 3 minutos (20 niveles/hora). Cuenta las monedas del drop por nivel
y las de los cofres (los ítems no se convierten a monedas). Con eso se fija:
- común ≈ 1 hora de monedas, rara ≈ 3 horas,
- legendaria = max(6000, 20 horas) — incluye la mascota legendaria.
El escudo de color es la excepción: 150 monedas, fijado por Q72.

`PRECIOS` (item_id → monedas) se calcula perezosamente con una semilla fija, así que es estable.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from functools import cache

from app.game import recompensas as rc
from app.game.tipos import Rareza

SEMILLA = 20261124
MINUTOS_POR_NIVEL = 3.0
HORAS_POR_RAREZA = {Rareza.COMUN: 1.0, Rareza.RARA: 3.0, Rareza.LEGENDARIA: 20.0}
PRECIO_MIN_LEGENDARIO = 6000
PRECIO_ESCUDO = 150
REDONDEO = 50


@dataclass(frozen=True, slots=True)
class ResultadoSimulacion:
    jugadores: int
    niveles: int
    monedas_por_nivel: float
    monedas_por_hora: float
    items_por_nivel: float
    legendarios_por_nivel: float
    max_cofres_sin_legendario: int


def simular(
    jugadores: int = 400,
    niveles: int = 300,
    *,
    semilla: int = SEMILLA,
    minutos_por_nivel: float = MINUTOS_POR_NIVEL,
    fraccion_repetidos: float = 0.0,
) -> ResultadoSimulacion:
    """Simula `jugadores` × `niveles` (abriendo cada cofre en cuanto sale)."""
    rng = random.Random(semilla)
    monedas = items = legendarios = 0
    peor_racha = 0
    for _ in range(jugadores):
        estado = rc.EstadoCofres()
        for _ in range(niveles):
            repetido = fraccion_repetidos > 0 and rng.random() < fraccion_repetidos
            estado, drop = rc.drop_nivel(estado, rng, repetido=repetido)
            monedas += drop.monedas
            if drop.item:
                items += 1
                legendarios += rc.ITEMS[drop.item].rareza is Rareza.LEGENDARIA
            if drop.cofre:
                estado, contenido = rc.abrir_cofre(estado, drop.cofre, rng)
                monedas += contenido.monedas
                items += len(contenido.items)
                legendarios += sum(
                    rc.ITEMS[i].rareza is Rareza.LEGENDARIA for i in contenido.items
                )
                peor_racha = max(peor_racha, estado.cofres_sin_legendario)
    total = jugadores * niveles
    por_nivel = monedas / total
    return ResultadoSimulacion(
        jugadores=jugadores,
        niveles=niveles,
        monedas_por_nivel=por_nivel,
        monedas_por_hora=por_nivel * 60 / minutos_por_nivel,
        items_por_nivel=items / total,
        legendarios_por_nivel=legendarios / total,
        max_cofres_sin_legendario=peor_racha,
    )


def redondear(x: float, paso: int = REDONDEO) -> int:
    return int(round(x / paso) * paso)


def precios_por_rareza(monedas_por_hora: float) -> dict[Rareza, int]:
    precios = {r: redondear(monedas_por_hora * h) for r, h in HORAS_POR_RAREZA.items()}
    precios[Rareza.LEGENDARIA] = max(PRECIO_MIN_LEGENDARIO, precios[Rareza.LEGENDARIA])
    return precios


def calcular_precios(resultado: ResultadoSimulacion) -> dict[str, int]:
    por_rareza = precios_por_rareza(resultado.monedas_por_hora)
    precios = {item.id: por_rareza[item.rareza] for item in rc.CATALOGO}
    precios["escudo_color"] = PRECIO_ESCUDO
    return precios


@cache
def simulacion_base() -> ResultadoSimulacion:
    return simular()


@cache
def _precios() -> dict[str, int]:
    return calcular_precios(simulacion_base())


def precio(item_id: str) -> int:
    return _precios()[item_id]


def __getattr__(nombre: str):
    # `PRECIOS` se calcula al primer acceso (la simulación tarda ~1 s).
    if nombre == "PRECIOS":
        return dict(_precios())
    raise AttributeError(nombre)
