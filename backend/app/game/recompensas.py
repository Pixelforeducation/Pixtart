"""Drops por nivel, cofres, ciclo legendario y pity (add-reward-system + Q10–Q15).

- Drop por nivel nuevo: monedas 10–30 siempre + 8 % de ítem; la rareza del ítem sale de la tabla
  de `reward-drops` restringida al 8 % (común 500, rara 299, legendaria 1 sobre 800).
- Repetir un nivel: 5–10 monedas, sin ítem y sin avanzar el contador de cofres.
- Cofre cada 5 niveles nuevos; tras 4 cofres normales el siguiente es legendario.
- Cofre normal: 40–80 monedas + 1 rara + slot variable (1 % legendaria; si no común 80/rara 20).
  Cofre legendario: 150–250 monedas + 1 rara + slot (10 % legendaria; si no común 60/rara 40).
  El % de legendario es por cofre.
- Pity: el cofre nº 30 seguido sin legendario trae legendario garantizado.
- Ganar el nivel final: cofre legendario extra (no cuenta en el ciclo de 4 normales).

Probabilidades con pesos enteros sobre 10 000 y `rng.randrange` (rng inyectado).
"""

from __future__ import annotations

import random
from dataclasses import dataclass, replace
from enum import StrEnum

from app.game.tipos import Rareza

R = Rareza

# ---------------------------------------------------------------- catálogo


class ClaseItem(StrEnum):
    CONSUMIBLE = "consumible"
    MASCOTA = "mascota"


@dataclass(frozen=True, slots=True)
class ItemDef:
    id: str
    nombre: str
    rareza: Rareza
    clase: ClaseItem = ClaseItem.CONSUMIBLE
    especie: str | None = None  # solo mascotas


C, M = ClaseItem.CONSUMIBLE, ClaseItem.MASCOTA

CATALOGO: tuple[ItemDef, ...] = (
    ItemDef("botiquin", "Botiquín", R.COMUN),
    ItemDef("pocion_tiempo", "Poción de tiempo", R.COMUN),
    ItemDef("lupa", "Lupa", R.COMUN),
    ItemDef("comida_mascota", "Comida de mascota", R.COMUN),
    ItemDef("escudo_color", "Escudo de color", R.COMUN),
    ItemDef("pocion_resurreccion", "Poción de resurrección", R.RARA),
    ItemDef("mascota_seti", "Seti", R.COMUN, M, "mushroom-sprout"),
    ItemDef("mascota_tictac", "Tictac", R.COMUN, M, "windup-robot"),
    ItemDef("mascota_borron", "Borrón", R.COMUN, M, "inkwell"),
    ItemDef("mascota_musgo", "Musgo", R.RARA, M, "mini-golem"),
    ItemDef("mascota_tomo", "Tomo", R.RARA, M, "book-golem"),
    ItemDef("mascota_zorro_brasas", "Brasa", R.LEGENDARIA, M, "ember-fox"),
    ItemDef("mascota_buho_cristal", "Cristal", R.LEGENDARIA, M, "crystal-owl"),
    ItemDef("mascota_nox", "Nox", R.LEGENDARIA, M, "onyx-dragon"),
)
ITEMS: dict[str, ItemDef] = {i.id: i for i in CATALOGO}

#: Mascota común regalada al empezar (Q110-C).
MASCOTA_INICIAL = "mascota_seti"

#: Mascotas del catálogo anterior → las nuevas (misma rareza). Sirve para leer partidas viejas.
#: Los monstruos de antes (diablillo, esqueleto, zombi, fantasma, caballero negro) ahora son enemigos.
MASCOTAS_RENOMBRADAS: dict[str, str] = {
    "mascota_chispa": "mascota_seti",
    "mascota_huesillo": "mascota_tictac",
    "mascota_zuzu": "mascota_borron",
    "mascota_orlo": "mascota_musgo",
    "mascota_bruma": "mascota_tomo",
    "mascota_onix": "mascota_nox",
}


def id_mascota_vigente(item_id: str) -> str:
    """Id actual de una mascota guardada con el catálogo anterior (o el mismo si no cambió)."""
    return MASCOTAS_RENOMBRADAS.get(item_id, item_id)


def items_de_rareza(rareza: Rareza) -> tuple[ItemDef, ...]:
    return tuple(i for i in CATALOGO if i.rareza is rareza)


# ---------------------------------------------------------------- tablas

ESCALA = 10_000
PROB_ITEM_NIVEL = 800  # 8 %
#: Rareza del ítem de nivel (pesos de reward-drops dentro del 8 %).
RAREZA_ITEM_NIVEL = ((R.COMUN, 500), (R.RARA, 299), (R.LEGENDARIA, 1))
MONEDAS_NIVEL = (10, 30)
MONEDAS_REPETIDO = (5, 10)

NIVELES_POR_COFRE = 5
NORMALES_ANTES_DE_LEGENDARIO = 4
PITY_COFRES = 30


class TipoCofre(StrEnum):
    NORMAL = "normal"
    LEGENDARIO = "legendario"


@dataclass(frozen=True, slots=True)
class ReglaCofre:
    monedas: tuple[int, int]
    prob_legendario: int  # sobre ESCALA
    resto: tuple[tuple[Rareza, int], ...]  # pesos del slot variable si no sale legendario


REGLAS_COFRE = {
    TipoCofre.NORMAL: ReglaCofre((40, 80), 100, ((R.COMUN, 80), (R.RARA, 20))),
    TipoCofre.LEGENDARIO: ReglaCofre((150, 250), 1000, ((R.COMUN, 60), (R.RARA, 40))),
}

assert sum(p for _, p in RAREZA_ITEM_NIVEL) == PROB_ITEM_NIVEL


def elegir_ponderado(rng: random.Random, tabla: tuple[tuple[Rareza, int], ...]) -> Rareza:
    total = sum(p for _, p in tabla)
    x = rng.randrange(total)
    for valor, peso in tabla:
        if x < peso:
            return valor
        x -= peso
    raise AssertionError("tabla vacía")  # pragma: no cover


def item_aleatorio(rng: random.Random, rareza: Rareza) -> str:
    return rng.choice(items_de_rareza(rareza)).id


# ---------------------------------------------------------------- estado y resultados


@dataclass(frozen=True, slots=True)
class EstadoCofres:
    """Contadores por usuario (globales, no por sección)."""

    niveles_desde_cofre: int = 0
    normales_desde_legendario: int = 0
    cofres_sin_legendario: int = 0


@dataclass(frozen=True, slots=True)
class DropNivel:
    monedas: int
    item: str | None = None
    cofre: TipoCofre | None = None


@dataclass(frozen=True, slots=True)
class ContenidoCofre:
    monedas: int
    items: tuple[str, ...]

    @property
    def trae_legendario(self) -> bool:
        return any(ITEMS[i].rareza is R.LEGENDARIA for i in self.items)


def drop_nivel(
    estado: EstadoCofres,
    rng: random.Random,
    *,
    repetido: bool = False,
    es_final: bool = False,
) -> tuple[EstadoCofres, DropNivel]:
    """Recompensa al completar un nivel. Decide aquí si toca cofre y de qué tipo."""
    if repetido:
        return estado, DropNivel(monedas=rng.randint(*MONEDAS_REPETIDO))
    monedas = rng.randint(*MONEDAS_NIVEL)
    item = None
    if rng.randrange(ESCALA) < PROB_ITEM_NIVEL:
        item = item_aleatorio(rng, elegir_ponderado(rng, RAREZA_ITEM_NIVEL))
    if es_final:
        return estado, DropNivel(monedas, item, TipoCofre.LEGENDARIO)
    niveles = estado.niveles_desde_cofre + 1
    cofre = None
    normales = estado.normales_desde_legendario
    if niveles >= NIVELES_POR_COFRE:
        niveles = 0
        if normales >= NORMALES_ANTES_DE_LEGENDARIO:
            cofre, normales = TipoCofre.LEGENDARIO, 0
        else:
            cofre, normales = TipoCofre.NORMAL, normales + 1
    nuevo = replace(estado, niveles_desde_cofre=niveles, normales_desde_legendario=normales)
    return nuevo, DropNivel(monedas, item, cofre)


def proximo_cofre(estado: EstadoCofres) -> TipoCofre:
    """Tipo del próximo cofre del camino (para dibujarlo)."""
    if estado.normales_desde_legendario >= NORMALES_ANTES_DE_LEGENDARIO:
        return TipoCofre.LEGENDARIO
    return TipoCofre.NORMAL


def abrir_cofre(
    estado: EstadoCofres, tipo: TipoCofre | str, rng: random.Random
) -> tuple[EstadoCofres, ContenidoCofre]:
    """Abre un cofre: monedas + 1 rara garantizada + slot variable (legendario por cofre).

    Pity: si ya van 29 cofres seguidos sin legendario, este (el 30) lo trae seguro.
    """
    regla = REGLAS_COFRE[TipoCofre(tipo)]
    monedas = rng.randint(*regla.monedas)
    items = [item_aleatorio(rng, R.RARA)]
    forzado = estado.cofres_sin_legendario >= PITY_COFRES - 1
    if forzado or rng.randrange(ESCALA) < regla.prob_legendario:
        items.append(item_aleatorio(rng, R.LEGENDARIA))
        sin_leg = 0
    else:
        items.append(item_aleatorio(rng, elegir_ponderado(rng, regla.resto)))
        sin_leg = estado.cofres_sin_legendario + 1
    return replace(estado, cofres_sin_legendario=sin_leg), ContenidoCofre(monedas, tuple(items))
