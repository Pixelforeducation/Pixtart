"""Selección de preguntas de un nivel y repaso espaciado (question-bank §3, Q23).

- `elegir_preguntas`: toma `n` preguntas sin repetir las vistas recientemente; si no alcanzan,
  relaja usando las vistas hace más tiempo. Las vencidas de repaso entran primero, con un
  máximo del 20 % del nivel.
- `elegir_reintento`: al repetir un nivel no aprobado, evita las preguntas que ya salieron.
- Repaso: interfaz `MotorRepaso` (lista para FSRS) y `Leitner` de 5 cajas con intervalos
  1, 3, 7, 16 y 35 días. Acierto → caja+1; fallo o timeout → caja 1.
"""

from __future__ import annotations

import math
import random
from collections.abc import Hashable, Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from typing import Protocol, TypeVar

Id = TypeVar("Id", bound=Hashable)

FRACCION_REPASO_MAX = 0.2


def elegir_preguntas(
    candidatas: Sequence[Id],
    n: int,
    rng: random.Random,
    *,
    vistas: Mapping[Id, datetime] | None = None,
    vencidas: Sequence[Id] = (),
    fraccion_repaso: float = FRACCION_REPASO_MAX,
) -> list[Id]:
    """Elige hasta `n` ids distintos de `candidatas`.

    `vistas`: id → última vez que se mostró. Las nunca vistas van primero (en orden aleatorio);
    si faltan, se completan con las vistas hace más tiempo. `vencidas`: ids de repaso vencidos
    (en orden de prioridad), de los que entran como mucho `floor(n × fraccion_repaso)`.
    El orden final se baraja.
    """
    if n <= 0:
        return []
    vistas = vistas or {}
    unicas = list(dict.fromkeys(candidatas))
    conjunto = set(unicas)
    elegidas: list[Id] = []
    cupo_repaso = math.floor(n * fraccion_repaso)
    for v in dict.fromkeys(vencidas):
        if len(elegidas) >= cupo_repaso:
            break
        if v in conjunto:
            elegidas.append(v)
    tomadas = set(elegidas)
    nuevas = [c for c in unicas if c not in vistas and c not in tomadas]
    rng.shuffle(nuevas)
    viejas = [c for c in unicas if c in vistas and c not in tomadas]
    rng.shuffle(viejas)  # desempate aleatorio entre iguales; sort es estable
    viejas.sort(key=lambda c: vistas[c])
    for c in nuevas + viejas:
        if len(elegidas) >= n:
            break
        elegidas.append(c)
    rng.shuffle(elegidas)
    return elegidas


def elegir_reintento(
    propias: Sequence[Id],
    alternas: Sequence[Id],
    fallidas: Sequence[Id],
    n: int,
    rng: random.Random,
    *,
    vistas: Mapping[Id, datetime] | None = None,
) -> list[Id]:
    """Preguntas para repetir un nivel no aprobado (mejora 6): diferentes, misma dificultad.

    `propias`: ids del nivel. `alternas`: ids de otros niveles (no finales) de la misma sección
    con la dificultad de alguna fallida. `fallidas`: ids servidos en el intento no aprobado.
    Prioridad: propias no fallidas → alternas no fallidas (nunca vistas primero, luego las vistas
    hace más tiempo) → fallidas como último recurso. Sin repetidos; el orden final se baraja.
    """
    if n <= 0:
        return []
    vistas = vistas or {}
    servidas = set(fallidas)
    elegidas: list[Id] = []
    tomadas: set[Id] = set()

    def tomar(grupo: list[Id]) -> None:
        for c in grupo:
            if len(elegidas) >= n:
                return
            if c not in tomadas:
                elegidas.append(c)
                tomadas.add(c)

    propias_u = list(dict.fromkeys(propias))
    frescas = [c for c in propias_u if c not in servidas]
    rng.shuffle(frescas)
    tomar(frescas)

    alt = [c for c in dict.fromkeys(alternas) if c not in servidas and c not in tomadas]
    nuevas = [c for c in alt if c not in vistas]
    rng.shuffle(nuevas)
    viejas = [c for c in alt if c in vistas]
    rng.shuffle(viejas)
    viejas.sort(key=lambda c: vistas[c])
    tomar(nuevas + viejas)

    repetibles = list(dict.fromkeys(fallidas))
    rng.shuffle(repetibles)
    tomar(repetibles)

    rng.shuffle(elegidas)
    return elegidas


# ---------------------------------------------------------------- repaso espaciado


@dataclass(frozen=True, slots=True)
class EstadoTarjeta:
    """Estado de repaso de (usuario, pregunta). `caja` es de Leitner; `datos` queda para FSRS."""

    vence: datetime
    caja: int = 1
    repeticiones: int = 0
    datos: tuple[tuple[str, float], ...] = ()


class MotorRepaso(Protocol):
    nombre: str

    def nueva(self, ahora: datetime) -> EstadoTarjeta: ...

    def registrar(self, tarjeta: EstadoTarjeta, correcta: bool, ahora: datetime) -> EstadoTarjeta:
        ...

    def vencida(self, tarjeta: EstadoTarjeta, ahora: datetime) -> bool: ...


class Leitner:
    nombre = "leitner"
    INTERVALOS_DIAS = (1, 3, 7, 16, 35)
    CAJAS = 5

    def nueva(self, ahora: datetime) -> EstadoTarjeta:
        return EstadoTarjeta(vence=ahora, caja=1)

    def registrar(self, tarjeta: EstadoTarjeta, correcta: bool, ahora: datetime) -> EstadoTarjeta:
        caja = min(self.CAJAS, tarjeta.caja + 1) if correcta else 1
        dias = self.INTERVALOS_DIAS[caja - 1]
        return replace(
            tarjeta, caja=caja, vence=ahora + timedelta(days=dias),
            repeticiones=tarjeta.repeticiones + 1,
        )

    def vencida(self, tarjeta: EstadoTarjeta, ahora: datetime) -> bool:
        return tarjeta.vence <= ahora


def motor_para(nombre: str) -> MotorRepaso:
    """`"leitner"` está implementado; `"fsrs"` queda pendiente (misma interfaz)."""
    if nombre == "leitner":
        return Leitner()
    if nombre == "fsrs":
        raise NotImplementedError("FSRS aún no está implementado; usa 'leitner'.")
    raise ValueError(f"motor de repaso desconocido: {nombre}")


def vencidas_ordenadas(
    tarjetas: Mapping[Id, EstadoTarjeta], motor: MotorRepaso, ahora: datetime
) -> list[Id]:
    """Ids vencidos, del más atrasado al menos."""
    vencidos = [(t.vence, i) for i, t in tarjetas.items() if motor.vencida(t, ahora)]
    return [i for _, i in sorted(vencidos, key=lambda x: x[0])]
