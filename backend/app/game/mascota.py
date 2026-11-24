"""Vidas, mascota, ayudas y hambre (Q2, Q4, Q88–Q106).

Un solo contador de 10 vidas del jugador; la mascota equipada lo "carga". Con 0 vidas la mascota
muere 20 minutos de tiempo real y mientras tanto no hay mascota: se sigue jugando sin ayudas y
fallar no cuesta nada extra. **Siempre se puede jugar.**

Todas las funciones son puras: reciben `ahora` (datetime aware) y devuelven un estado nuevo.
La resurrección por tiempo es perezosa: cualquier función que reciba `ahora` la aplica primero.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from typing import Any

from app.game.tipos import (
    TIPOS_ABIERTOS,
    TIPOS_FILL,
    TIPOS_OPCIONES,
    AccionInvalida,
    Pregunta,
    Rareza,
    TipoPregunta,
)

VIDAS_MAX = 10
DURACION_MUERTE = timedelta(minutes=20)
BOTIQUIN_CURA = 3
AYUDAS_POR_RAREZA = {Rareza.COMUN: 1, Rareza.RARA: 2, Rareza.LEGENDARIA: 3}


class SinAyuda(AccionInvalida):
    """No hay ayuda disponible (sin mascota, muerta, cupo agotado o tipo no cubierto)."""


def _aware(ahora: datetime) -> datetime:
    if ahora.tzinfo is None or ahora.utcoffset() is None:
        raise ValueError("`ahora` debe ser un datetime con zona horaria")
    return ahora


@dataclass(frozen=True, slots=True)
class Mascota:
    id: str
    especie: str
    rareza: Rareza


@dataclass(frozen=True, slots=True)
class EstadoVidas:
    """Estado del jugador relativo a vidas y mascota equipada.

    `muerta_hasta` != None significa que la mascota equipada está muerta hasta ese instante.
    `comida` es la comida única que comparten todas las mascotas (Q98).
    `ayudas_usadas_nivel` se reinicia con `iniciar_nivel`.
    """

    vidas: int = VIDAS_MAX
    mascota: Mascota | None = None
    muerta_hasta: datetime | None = None
    comida: int = 0
    ayudas_usadas_nivel: int = 0
    nivel_sin_ayudas: bool = False  # nivel final: examen sin ayudas (Q106)


# ---------------------------------------------------------------- consultas


def actualizar(estado: EstadoVidas, ahora: datetime) -> EstadoVidas:
    """Aplica la resurrección por tiempo si ya pasaron los 20 minutos (vuelve con 10 vidas)."""
    _aware(ahora)
    if estado.muerta_hasta is not None and ahora >= estado.muerta_hasta:
        return replace(estado, muerta_hasta=None, vidas=VIDAS_MAX)
    return estado


def esta_viva(estado: EstadoVidas, ahora: datetime) -> bool:
    estado = actualizar(estado, ahora)
    return estado.mascota is not None and estado.muerta_hasta is None


def hambrienta(estado: EstadoVidas) -> bool:
    return estado.comida <= 0


def cupo_ayudas(rareza: Rareza | str, con_hambre: bool) -> int:
    """Ayudas por nivel: común 1, rara 2, legendaria 3. Con hambre la mitad hacia abajo,
    con mínimo 1 solo para la legendaria."""
    rareza = Rareza(rareza)
    n = AYUDAS_POR_RAREZA[rareza]
    if con_hambre:
        n //= 2
        if rareza is Rareza.LEGENDARIA:
            n = max(1, n)
    return n


def ayudas_restantes(estado: EstadoVidas, ahora: datetime) -> int:
    estado = actualizar(estado, ahora)
    if not esta_viva(estado, ahora) or estado.nivel_sin_ayudas:
        return 0
    assert estado.mascota is not None
    cupo = cupo_ayudas(estado.mascota.rareza, hambrienta(estado))
    return max(0, cupo - estado.ayudas_usadas_nivel)


def vista_mascota(estado: EstadoVidas, ahora: datetime) -> dict[str, Any] | None:
    """`EstadoMascota` del contrato, o None si no hay mascota equipada."""
    estado = actualizar(estado, ahora)
    if estado.mascota is None:
        return None
    return {
        "id": estado.mascota.id,
        "especie": estado.mascota.especie,
        "rareza": str(estado.mascota.rareza),
        "viva": estado.muerta_hasta is None,
        "revive_en": estado.muerta_hasta.isoformat() if estado.muerta_hasta else None,
        "comida": estado.comida,
        "hambrienta": hambrienta(estado),
        "ayudas_restantes_nivel": ayudas_restantes(estado, ahora),
    }


# ---------------------------------------------------------------- transiciones


def equipar(estado: EstadoVidas, mascota: Mascota, ahora: datetime) -> EstadoVidas:
    """Equipa otra mascota. No se puede mientras la actual está muerta (Q90: no hay mascota)."""
    estado = actualizar(estado, ahora)
    if estado.muerta_hasta is not None:
        raise AccionInvalida("Tu mascota está muerta: espera a que reviva o usa una poción.")
    return replace(estado, mascota=mascota)


def iniciar_nivel(
    estado: EstadoVidas, ahora: datetime, *, es_final: bool = False
) -> EstadoVidas:
    """Reinicia el cupo de ayudas del nivel. El nivel final no tiene ayudas (Q106)."""
    estado = actualizar(estado, ahora)
    return replace(estado, ayudas_usadas_nivel=0, nivel_sin_ayudas=es_final)


def registrar_respuesta(
    estado: EstadoVidas,
    correcta: bool,
    ahora: datetime,
    *,
    calentamiento: bool = False,
) -> EstadoVidas:
    """−1 vida por respuesta mala o timeout (pásalo como `correcta=False`).

    No cuesta en calentamiento ni si no hay mascota viva (Q92). Al llegar a 0 la mascota
    muere 20 minutos reales.
    """
    estado = actualizar(estado, ahora)
    if correcta or calentamiento or not esta_viva(estado, ahora):
        return estado
    vidas = max(0, estado.vidas - 1)
    if vidas == 0:
        return replace(estado, vidas=0, muerta_hasta=ahora + DURACION_MUERTE)
    return replace(estado, vidas=vidas)


def completar_nivel(
    estado: EstadoVidas, ahora: datetime, *, sin_timeouts: bool, completa_seccion: bool = False
) -> EstadoVidas:
    """+1 vida (tope 10) por nivel sin timeouts; recarga total si completa la sección.

    Solo con la mascota viva: una mascota muerta no se resucita completando niveles.
    """
    estado = actualizar(estado, ahora)
    if not esta_viva(estado, ahora):
        return estado
    if completa_seccion:
        return replace(estado, vidas=VIDAS_MAX)
    if sin_timeouts:
        return replace(estado, vidas=min(VIDAS_MAX, estado.vidas + 1))
    return estado


def usar_botiquin(estado: EstadoVidas, ahora: datetime) -> EstadoVidas:
    """+3 vidas, tope 10. Solo cura a una mascota viva (Q95)."""
    estado = actualizar(estado, ahora)
    if estado.mascota is None:
        raise AccionInvalida("No tienes mascota equipada.")
    if estado.muerta_hasta is not None:
        raise AccionInvalida("El botiquín no resucita: usa una poción de resurrección.")
    if estado.vidas >= VIDAS_MAX:
        raise AccionInvalida("Ya tienes todas las vidas.")
    return replace(estado, vidas=min(VIDAS_MAX, estado.vidas + BOTIQUIN_CURA))


def usar_pocion_resurreccion(estado: EstadoVidas, ahora: datetime) -> EstadoVidas:
    """Revive al instante con las 10 vidas (Q93)."""
    estado = actualizar(estado, ahora)
    if estado.muerta_hasta is None:
        raise AccionInvalida("Tu mascota no está muerta.")
    return replace(estado, muerta_hasta=None, vidas=VIDAS_MAX)


def dar_comida(estado: EstadoVidas, cantidad: int = 1) -> EstadoVidas:
    if cantidad <= 0:
        raise ValueError("cantidad debe ser positiva")
    return replace(estado, comida=estado.comida + cantidad)


# ---------------------------------------------------------------- ayudas


def ayuda_para(
    pregunta: Pregunta,
    rareza: Rareza | str,
    rng: random.Random,
    *,
    ya_dadas: frozenset[int] = frozenset(),
) -> dict[str, Any] | None:
    """La ayuda que da una mascota de `rareza` para `pregunta`, o None si no ayuda.

    `ya_dadas`: índices ya eliminados (MC) o posiciones ya fijadas (ordering), para no repetir.
    - común: solo MC/VF, elimina una opción incorrecta.
    - rara: MC/VF elimina una; fill revela una parte; numeric da un intervalo que contiene la
      respuesta; ordering fija un paso. Nada en open/math/proof.
    - legendaria: todo lo anterior y en open/math/proof `{"tipo": "pista_ia"}` (la capa de API
      pide la pista al LLM con la key BYOK o, sin key, usa la pista escrita).
    """
    rareza = Rareza(rareza)
    tipo = pregunta.tipo
    if tipo in TIPOS_OPCIONES:
        return _eliminar_opcion(pregunta, rng, ya_dadas)
    if rareza is Rareza.COMUN:
        return None
    if tipo in TIPOS_FILL:
        return _revelar_parte(pregunta)
    if tipo is TipoPregunta.NUMERIC:
        return _intervalo(pregunta, rng)
    if tipo is TipoPregunta.ORDERING:
        return _fijar_paso(pregunta, rng, ya_dadas)
    if tipo in TIPOS_ABIERTOS:
        if rareza is Rareza.LEGENDARIA:
            return {"tipo": "pista_ia", "pista_escrita": pregunta.pista}
        return None
    return None


def _eliminar_opcion(
    p: Pregunta, rng: random.Random, ya_dadas: frozenset[int]
) -> dict[str, Any] | None:
    if p.tipo is TipoPregunta.TRUE_FALSE:
        n, correcta = 2, (0 if p.respuesta else 1)
    else:
        n, correcta = len(p.opciones), int(p.respuesta)
    incorrectas = [i for i in range(n) if i != correcta and i not in ya_dadas]
    # Siempre deben quedar al menos dos opciones visibles (la correcta y otra) salvo en V/F.
    visibles = n - len(ya_dadas)
    if not incorrectas or (p.tipo is TipoPregunta.MULTIPLE_CHOICE and visibles <= 2):
        return None
    return {"tipo": "eliminar_opcion", "eliminar_opcion": rng.choice(incorrectas)}


def _revelar_parte(p: Pregunta) -> dict[str, Any] | None:
    aceptadas = [a for a in (p.respuesta or ()) if a]
    if not aceptadas:
        return None
    texto = str(aceptadas[0])
    k = max(1, math.ceil(len(texto) / 3)) if len(texto) > 1 else 0
    if k == 0:
        return {"tipo": "revelar_parte", "prefijo": "", "longitud": len(texto)}
    return {"tipo": "revelar_parte", "prefijo": texto[:k], "longitud": len(texto)}


def _intervalo(p: Pregunta, rng: random.Random) -> dict[str, Any]:
    r = float(p.respuesta)
    tol = float(p.tolerancia or 0)
    ancho = max(abs(r) * 0.4, tol * 4, 2.0)
    # La respuesta cae en una posición aleatoria (no siempre al centro) entre 15 % y 85 %.
    u = rng.uniform(0.15, 0.85)
    lo = r - ancho * u
    return {"tipo": "intervalo", "min": lo, "max": lo + ancho}


def _fijar_paso(
    p: Pregunta, rng: random.Random, ya_dadas: frozenset[int]
) -> dict[str, Any] | None:
    orden = list(p.respuesta)
    libres = [i for i in range(len(orden)) if i not in ya_dadas]
    if len(libres) <= 1:
        return None
    pos = rng.choice(libres)
    return {"tipo": "fijar_paso", "posicion": pos, "elemento": orden[pos]}


def usar_ayuda(
    estado: EstadoVidas,
    pregunta: Pregunta,
    rng: random.Random,
    ahora: datetime,
    *,
    ya_dadas: frozenset[int] = frozenset(),
) -> tuple[EstadoVidas, dict[str, Any]]:
    """Pide una ayuda: valida cupo y tipo, consume 1 ayuda del nivel y 1 comida (si hay)."""
    estado = actualizar(estado, ahora)
    if ayudas_restantes(estado, ahora) <= 0:
        raise SinAyuda("No hay ayudas disponibles en este nivel.")
    assert estado.mascota is not None
    ayuda = ayuda_para(pregunta, estado.mascota.rareza, rng, ya_dadas=ya_dadas)
    if ayuda is None:
        raise SinAyuda("Tu mascota no puede ayudar con esta pregunta.")
    nuevo = replace(
        estado,
        ayudas_usadas_nivel=estado.ayudas_usadas_nivel + 1,
        comida=max(0, estado.comida - 1),
    )
    return nuevo, ayuda
