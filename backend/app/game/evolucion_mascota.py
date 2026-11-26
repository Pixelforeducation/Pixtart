"""Evolución de mascotas (mejora 10): XP de mascota por rachas de aciertos sin ayuda.

Premia a quien menos usa a su mascota y menos vidas pierde:
- Acierto sin ayuda: la racha sube 1 y se ganan `2 + min(3, racha // 3)` XP.
- Acierto con ayuda, fallo o timeout: la racha vuelve a 0 y no se gana XP.
- Al terminar un nivel aprobado: +10 si no se usó ninguna ayuda ni se perdió ninguna vida;
  +4 si se cumplió solo una de las dos; si no, 0.

Etapas por XP acumulada: 1 desde 0, 2 desde 60, 3 desde 200. La etapa 3 (forma final) da
`AYUDA_EXTRA_ETAPA_3` ayuda extra por nivel (`mascota.cupo_ayudas(..., etapa=3)`).
"""

from __future__ import annotations

from dataclasses import dataclass, replace

#: XP mínima de cada etapa (etapa 1, 2, 3).
UMBRALES: tuple[int, ...] = (0, 60, 200)
AYUDA_EXTRA_ETAPA_3 = 1
BONUS_NIVEL_PERFECTO = 10
BONUS_NIVEL_PARCIAL = 4


@dataclass(frozen=True)
class EvolucionMascota:
    xp: int = 0
    racha_sin_ayuda: int = 0


def etapa(xp: int) -> int:
    """Etapa (1, 2 o 3) que corresponde a `xp`."""
    return sum(1 for u in UMBRALES if xp >= u) or 1


def xp_siguiente(xp: int) -> int | None:
    """XP total necesaria para la siguiente etapa, o None si ya está en la última."""
    for u in UMBRALES:
        if xp < u:
            return u
    return None


def registrar_respuesta(
    ev: EvolucionMascota, *, correcta: bool, uso_ayuda: bool, perdio_vida: bool
) -> tuple[EvolucionMascota, int]:
    """Devuelve (evolución nueva, XP ganada en esta respuesta).

    `perdio_vida` se acepta por simetría con el servicio: perder una vida implica fallo, y el
    fallo ya corta la racha.
    """
    if correcta and not uso_ayuda and not perdio_vida:
        racha = ev.racha_sin_ayuda + 1
        ganada = 2 + min(3, racha // 3)
        return replace(ev, xp=ev.xp + ganada, racha_sin_ayuda=racha), ganada
    return replace(ev, racha_sin_ayuda=0), 0


def bonus_nivel(*, ayudas_usadas: int, vidas_perdidas: int, aprobado: bool) -> int:
    """XP extra de mascota al terminar un nivel."""
    if not aprobado:
        return 0
    sin_ayudas = ayudas_usadas == 0
    sin_perder = vidas_perdidas == 0
    if sin_ayudas and sin_perder:
        return BONUS_NIVEL_PERFECTO
    if sin_ayudas or sin_perder:
        return BONUS_NIVEL_PARCIAL
    return 0
