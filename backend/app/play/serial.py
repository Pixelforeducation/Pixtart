"""(De)serialización JSON de los estados inmutables de `app/game`."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from types import MappingProxyType
from typing import Any

from app.game.evolucion_mascota import EvolucionMascota
from app.game.experiencia import EstadoProgreso
from app.game.mascota import EstadoVidas, Mascota
from app.game.recompensas import ITEMS, EstadoCofres, id_mascota_vigente
from app.game.seleccion import EstadoTarjeta
from app.game.tipos import Rareza


def utc(dt: datetime) -> datetime:
    """SQLite devuelve datetimes sin zona: se asumen UTC."""
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt


def _dt(s: str | None) -> datetime | None:
    return utc(datetime.fromisoformat(s)) if s else None


def _d(s: str | None) -> date | None:
    return date.fromisoformat(s) if s else None


# ---------------------------------------------------------------- progreso


def progreso_a_json(p: EstadoProgreso) -> dict[str, Any]:
    return {
        "zona_horaria": p.zona_horaria,
        "liquidado_hasta": p.liquidado_hasta.isoformat(),
        "xp_total_por_tema": dict(p.xp_total_por_tema),
        "xp_color": p.xp_color,
        "escudos": p.escudos,
        "racha": p.racha,
        "ultimo_dia_jugado": p.ultimo_dia_jugado.isoformat() if p.ultimo_dia_jugado else None,
        "niveles_hoy": p.niveles_hoy,
    }


def progreso_desde_json(d: dict[str, Any]) -> EstadoProgreso:
    return EstadoProgreso(
        zona_horaria=d["zona_horaria"],
        liquidado_hasta=date.fromisoformat(d["liquidado_hasta"]),
        xp_total_por_tema=MappingProxyType({k: int(v) for k, v in d["xp_total_por_tema"].items()}),
        xp_color=int(d["xp_color"]),
        escudos=int(d["escudos"]),
        racha=int(d["racha"]),
        ultimo_dia_jugado=_d(d.get("ultimo_dia_jugado")),
        niveles_hoy=int(d.get("niveles_hoy", 0)),
    )


# ---------------------------------------------------------------- vidas y mascota


def vidas_a_json(v: EstadoVidas) -> dict[str, Any]:
    m = v.mascota
    return {
        "vidas": v.vidas,
        "mascota": {"id": m.id, "especie": m.especie, "rareza": str(m.rareza)} if m else None,
        "muerta_hasta": v.muerta_hasta.isoformat() if v.muerta_hasta else None,
        "comida": v.comida,
        "ayudas_usadas_nivel": v.ayudas_usadas_nivel,
        "nivel_sin_ayudas": v.nivel_sin_ayudas,
    }


def _mascota_desde_json(m: dict[str, Any]) -> Mascota:
    """Traduce mascotas del catálogo anterior (id y especie) a las vigentes."""
    nuevo = id_mascota_vigente(m["id"])
    d = ITEMS.get(nuevo)
    if nuevo != m["id"] and d is not None:
        return Mascota(d.id, d.especie or "", d.rareza)
    return Mascota(m["id"], m["especie"], Rareza(m["rareza"]))


def vidas_desde_json(d: dict[str, Any]) -> EstadoVidas:
    m = d.get("mascota")
    return EstadoVidas(
        vidas=int(d["vidas"]),
        mascota=_mascota_desde_json(m) if m else None,
        muerta_hasta=_dt(d.get("muerta_hasta")),
        comida=int(d.get("comida", 0)),
        ayudas_usadas_nivel=int(d.get("ayudas_usadas_nivel", 0)),
        nivel_sin_ayudas=bool(d.get("nivel_sin_ayudas", False)),
    )


# ---------------------------------------------------------------- cofres


def cofres_a_json(c: EstadoCofres) -> dict[str, Any]:
    return {
        "niveles_desde_cofre": c.niveles_desde_cofre,
        "normales_desde_legendario": c.normales_desde_legendario,
        "cofres_sin_legendario": c.cofres_sin_legendario,
    }


def cofres_desde_json(d: dict[str, Any]) -> EstadoCofres:
    return EstadoCofres(**{k: int(v) for k, v in d.items()})


# ---------------------------------------------------------------- repaso


def tarjeta_a_json(t: EstadoTarjeta) -> dict[str, Any]:
    return {
        "vence": t.vence.isoformat(),
        "caja": t.caja,
        "repeticiones": t.repeticiones,
        "datos": [list(x) for x in t.datos],
    }


def tarjeta_desde_json(d: dict[str, Any]) -> EstadoTarjeta:
    vence = _dt(d["vence"])
    assert vence is not None
    return EstadoTarjeta(
        vence=vence,
        caja=int(d["caja"]),
        repeticiones=int(d.get("repeticiones", 0)),
        datos=tuple((str(k), float(v)) for k, v in d.get("datos", [])),
    )


# ---------------------------------------------------------------- extras (v0.3)

MINIMO_APROBAR_POR_DEFECTO = 60
RANURAS = ("arma", "armadura", "ropa")


@dataclass
class Extras:
    """Ajustes y colecciones v0.3 guardados en `EstadoJugador.extras` (ids internos)."""

    minimo_aprobar: int = MINIMO_APROBAR_POR_DEFECTO
    equipo: dict[str, str | None] = field(default_factory=lambda: dict.fromkeys(RANURAS))
    evoluciones: dict[str, EvolucionMascota] = field(default_factory=dict)


def extras_desde_json(d: dict[str, Any] | None) -> Extras:
    d = d or {}
    try:
        minimo = max(0, min(100, int(d.get("minimo_aprobar", MINIMO_APROBAR_POR_DEFECTO))))
    except (TypeError, ValueError):
        minimo = MINIMO_APROBAR_POR_DEFECTO
    equipo_json = d.get("equipo") or {}
    equipo = {r: (equipo_json.get(r) or None) for r in RANURAS}
    evoluciones = {
        str(k): EvolucionMascota(
            xp=int(v.get("xp", 0)), racha_sin_ayuda=int(v.get("racha_sin_ayuda", 0))
        )
        for k, v in (d.get("evoluciones") or {}).items()
        if isinstance(v, dict)
    }
    return Extras(minimo, equipo, evoluciones)


def extras_a_json(x: Extras) -> dict[str, Any]:
    return {
        "minimo_aprobar": x.minimo_aprobar,
        "equipo": {r: x.equipo.get(r) for r in RANURAS},
        "evoluciones": {
            k: {"xp": v.xp, "racha_sin_ayuda": v.racha_sin_ayuda}
            for k, v in sorted(x.evoluciones.items())
        },
    }
