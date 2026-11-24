"""Experiencia: `xp_total` por tema (tiers), `xp_color` global con decaimiento, escudos y racha.

- XP (Q8-A): +10 acierto, +20 nivel, +30 perfecto, +100 jefe, +5×min(racha,10). Errores no restan.
- `xp_total` nunca baja y decide el tier (6 tiers, por tema; el perfil muestra el más alto).
- `xp_color` (global): sube con toda la XP positiva, empieza en 100, tope 3000, y baja −50 por
  cada día **cerrado** sin jugar (piso 0). El día corta a las 04:00 en la zona del perfil.
- Escudos de color: cubren 1 día cada uno, máximo 2; +1 por cada 7 días seguidos jugados.
- Día jugado = completar ≥ 1 nivel o repaso (meta diaria = 1 nivel).

Liquidación perezosa e idempotente: `liquidar_decaimiento(estado, ahora)` liquida los días
cerrados entre `liquidado_hasta` y hoy. Toda función que toque estos contadores la llama antes.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from datetime import date, datetime, time, timedelta
from types import MappingProxyType
from zoneinfo import ZoneInfo

from app.game.tipos import AccionInvalida

XP_ACIERTO = 10
XP_NIVEL = 20
XP_PERFECTO = 30
XP_JEFE = 100
XP_RACHA_POR_DIA = 5
RACHA_TOPE_BONUS = 10

XP_COLOR_INICIAL = 100
XP_COLOR_TOPE = 3000
DECAIMIENTO_POR_DIA = 50
CORTE_DIA = time(4, 0)

ESCUDOS_MAX = 2
DIAS_POR_ESCUDO = 7
META_DIARIA_NIVELES = 1

#: (tier, nombre, xp mínima) — add-user-profile, Decisión 1.
TIERS: tuple[tuple[int, str, int], ...] = (
    (1, "Brote", 0),
    (2, "Explorador", 300),
    (3, "Aventurero", 900),
    (4, "Guardián", 2000),
    (5, "Campeón", 4000),
    (6, "Leyenda", 7000),
)


def tier_para(xp_total: int) -> int:
    tier = 1
    for n, _nombre, minimo in TIERS:
        if xp_total >= minimo:
            tier = n
    return tier


def nombre_tier(tier: int) -> str:
    return TIERS[tier - 1][1]


def xp_respuesta(correcta: bool) -> int:
    """+10 por acierto; un error o timeout da 0 (nunca resta, Q87)."""
    return XP_ACIERTO if correcta else 0


def bonus_racha(racha: int) -> int:
    return XP_RACHA_POR_DIA * min(max(racha, 0), RACHA_TOPE_BONUS)


def xp_fin_nivel(*, perfecto: bool, es_jefe: bool = False) -> int:
    """XP por terminar un nivel (sin contar aciertos ni racha)."""
    return XP_NIVEL + (XP_PERFECTO if perfecto else 0) + (XP_JEFE if es_jefe else 0)


def dia_de_juego(ahora: datetime, zona_horaria: str) -> date:
    """Fecha del día de juego: el día corta a las 04:00 locales."""
    if ahora.tzinfo is None or ahora.utcoffset() is None:
        raise ValueError("`ahora` debe ser un datetime con zona horaria")
    local = ahora.astimezone(ZoneInfo(zona_horaria))
    corte = timedelta(hours=CORTE_DIA.hour, minutes=CORTE_DIA.minute)
    return (local - corte).date()


@dataclass(frozen=True, slots=True)
class EstadoProgreso:
    """Contadores de experiencia de una cuenta.

    `liquidado_hasta`: último día cerrado ya liquidado (el de registro cuenta como liquidado:
    nunca se penaliza). `ultimo_dia_jugado`: último día en que se completó ≥ 1 nivel o repaso.
    `niveles_hoy`: niveles completados en `ultimo_dia_jugado` (para la meta diaria).
    """

    zona_horaria: str
    liquidado_hasta: date
    xp_total_por_tema: Mapping[str, int] = field(default_factory=lambda: MappingProxyType({}))
    xp_color: int = XP_COLOR_INICIAL
    escudos: int = 0
    racha: int = 0
    ultimo_dia_jugado: date | None = None
    niveles_hoy: int = 0

    @property
    def tier_por_tema(self) -> dict[str, int]:
        return {t: tier_para(x) for t, x in self.xp_total_por_tema.items()}

    @property
    def tier_maximo(self) -> int:
        return max(self.tier_por_tema.values(), default=1)


def nuevo_progreso(ahora: datetime, zona_horaria: str) -> EstadoProgreso:
    hoy = dia_de_juego(ahora, zona_horaria)
    return EstadoProgreso(zona_horaria=zona_horaria, liquidado_hasta=hoy)


def liquidar_decaimiento(estado: EstadoProgreso, ahora: datetime) -> EstadoProgreso:
    """Liquida en orden los días cerrados pendientes: jugado → nada; si no, escudo → se gasta;
    si no, −50 de `xp_color` (piso 0). Un día sin jugar también rompe la racha.

    Idempotente: llamarla dos veces con el mismo `ahora` (o uno anterior) no cambia nada.
    """
    hoy = dia_de_juego(ahora, estado.zona_horaria)
    ultimo_cerrado = hoy - timedelta(days=1)
    if ultimo_cerrado <= estado.liquidado_hasta:
        return estado
    xp_color, escudos, racha = estado.xp_color, estado.escudos, estado.racha
    dia = estado.liquidado_hasta + timedelta(days=1)
    while dia <= ultimo_cerrado:
        # Como cada partida liquida antes de registrarse, el único día jugado posible en el
        # intervalo pendiente es `ultimo_dia_jugado`.
        if dia != estado.ultimo_dia_jugado:
            racha = 0
            if escudos > 0:
                escudos -= 1
            else:
                xp_color = max(0, xp_color - DECAIMIENTO_POR_DIA)
            if xp_color == 0 and escudos == 0:
                break  # coste acotado: el resto de la ausencia ya no cambia nada
        dia += timedelta(days=1)
    return replace(
        estado, xp_color=xp_color, escudos=escudos, racha=racha, liquidado_hasta=ultimo_cerrado
    )


def sumar_xp(estado: EstadoProgreso, tema: str, xp: int, ahora: datetime) -> EstadoProgreso:
    """Suma XP positiva al tema y a `xp_color` (tope 3000). XP ≤ 0 no hace nada."""
    estado = liquidar_decaimiento(estado, ahora)
    if xp <= 0:
        return estado
    por_tema = dict(estado.xp_total_por_tema)
    por_tema[tema] = por_tema.get(tema, 0) + xp
    return replace(
        estado,
        xp_total_por_tema=MappingProxyType(por_tema),
        xp_color=min(XP_COLOR_TOPE, estado.xp_color + xp),
    )


def registrar_dia_jugado(estado: EstadoProgreso, ahora: datetime) -> tuple[EstadoProgreso, int]:
    """Marca hoy como jugado. La primera vez del día sube la racha, puede dar un escudo
    (cada 7 días seguidos, tope 2) y devuelve el bonus de racha a otorgar (0 si ya contaba)."""
    estado = liquidar_decaimiento(estado, ahora)
    hoy = dia_de_juego(ahora, estado.zona_horaria)
    if estado.ultimo_dia_jugado == hoy:
        return replace(estado, niveles_hoy=estado.niveles_hoy + 1), 0
    racha = estado.racha + 1
    escudos = estado.escudos
    if racha % DIAS_POR_ESCUDO == 0:
        escudos = min(ESCUDOS_MAX, escudos + 1)
    nuevo = replace(estado, racha=racha, escudos=escudos, ultimo_dia_jugado=hoy, niveles_hoy=1)
    return nuevo, bonus_racha(racha)


def completar_nivel(
    estado: EstadoProgreso,
    tema: str,
    ahora: datetime,
    *,
    aciertos: int = 0,
    perfecto: bool = False,
    es_jefe: bool = False,
    cuenta_como_dia: bool = True,
) -> tuple[EstadoProgreso, int]:
    """Cierra un nivel: aciertos×10 + 20 (+30 perfecto, +100 jefe) + bonus de racha del día.

    `aciertos`: pásalo solo si no sumaste ya los +10 por respuesta con `sumar_xp`.
    `cuenta_como_dia=False` para casos que no cuentan como día jugado (p. ej. repetir un
    calentamiento ya completado). Devuelve (estado, xp_ganada).
    """
    estado = liquidar_decaimiento(estado, ahora)
    xp = aciertos * XP_ACIERTO + xp_fin_nivel(perfecto=perfecto, es_jefe=es_jefe)
    if cuenta_como_dia:
        estado, bonus = registrar_dia_jugado(estado, ahora)
        xp += bonus
    return sumar_xp(estado, tema, xp, ahora), xp


def comprar_escudo(estado: EstadoProgreso, ahora: datetime) -> EstadoProgreso:
    """Añade un escudo (el cobro de monedas lo hace quien llama). Falla si ya hay 2."""
    estado = liquidar_decaimiento(estado, ahora)
    if estado.escudos >= ESCUDOS_MAX:
        raise AccionInvalida("Ya tienes el máximo de escudos de color.")
    return replace(estado, escudos=estado.escudos + 1)


def meta_diaria_cumplida(estado: EstadoProgreso, ahora: datetime) -> bool:
    hoy = dia_de_juego(ahora, estado.zona_horaria)
    return estado.ultimo_dia_jugado == hoy and estado.niveles_hoy >= META_DIARIA_NIVELES


def racha_vigente(estado: EstadoProgreso, ahora: datetime) -> int:
    """Racha tras liquidar (0 si ayer no se jugó)."""
    return liquidar_decaimiento(estado, ahora).racha
