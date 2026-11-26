"""Endpoints `/api/juego/*` (ver `app/api/CONTRATO.md`, sección Juego)."""

import random
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.deps import usuario_actual
from app.core.db import get_db
from app.game.tipos import AccionInvalida
from app.models.usuarios import Usuario
from app.play import deps
from app.play.fuente_cursos import FuenteCursos
from app.play.pista import GeneradorPista
from app.play.servicio import Juego, NoEncontrado

router = APIRouter(prefix="/api/juego", tags=["juego"])


def juego(
    usuario: Usuario = Depends(usuario_actual),
    db: Session = Depends(get_db),
    fuente: FuenteCursos = Depends(deps.fuente_cursos),
    ahora: datetime = Depends(deps.ahora),
    rng: random.Random = Depends(deps.rng),
    generador: GeneradorPista = Depends(deps.generador_pista),
) -> Juego:
    return Juego(db, usuario, fuente, ahora, rng, generador)


def _ejecutar(f, *args, **kwargs) -> Any:
    try:
        return f(*args, **kwargs)
    except NoEncontrado as e:
        raise HTTPException(404, e.mensaje) from None
    except AccionInvalida as e:  # incluye SinAyuda
        raise HTTPException(409, str(e)) from None


class Responder(BaseModel):
    pregunta_id: str
    respuesta: Any = None
    tiempo_ms: int = Field(ge=0)


class PorPregunta(BaseModel):
    pregunta_id: str


class PorItem(BaseModel):
    item_id: str
    # Solo para poción de tiempo y lupa (extensión del contrato).
    intento_id: str | None = None
    pregunta_id: str | None = None


class PorMascota(BaseModel):
    mascota_id: str


class PorPaleta(BaseModel):
    paleta_id: str


class PorEquipable(BaseModel):
    item_id: str


class PorRanura(BaseModel):
    ranura: Literal["arma", "armadura", "ropa"]


class Ajustes(BaseModel):
    minimo_aprobar: int = Field(ge=0, le=100)


@router.get("/estado")
def estado(j: Juego = Depends(juego)) -> dict[str, Any]:
    return j.vista_estado()


@router.get("/cursos/{curso_id}/camino")
def camino(curso_id: str, j: Juego = Depends(juego)) -> dict[str, Any]:
    return _ejecutar(j.camino, curso_id)


@router.post("/niveles/{nivel_id}/iniciar")
def iniciar(nivel_id: str, j: Juego = Depends(juego)) -> dict[str, Any]:
    return _ejecutar(j.iniciar, nivel_id)


@router.post("/intentos/{intento_id}/responder")
def responder(intento_id: str, cuerpo: Responder, j: Juego = Depends(juego)) -> dict[str, Any]:
    return _ejecutar(j.responder, intento_id, cuerpo.pregunta_id, cuerpo.respuesta, cuerpo.tiempo_ms)


@router.post("/intentos/{intento_id}/pausar", status_code=204)
def pausar(intento_id: str, j: Juego = Depends(juego)) -> Response:
    _ejecutar(j.pausar, intento_id)
    return Response(status_code=204)


@router.post("/intentos/{intento_id}/ayuda")
def ayuda(intento_id: str, cuerpo: PorPregunta, j: Juego = Depends(juego)) -> dict[str, Any]:
    return _ejecutar(j.ayuda, intento_id, cuerpo.pregunta_id)


@router.post("/intentos/{intento_id}/terminar")
def terminar(intento_id: str, j: Juego = Depends(juego)) -> dict[str, Any]:
    return _ejecutar(j.terminar, intento_id)


@router.post("/cofres/{cofre_id}/abrir")
def abrir_cofre(cofre_id: str, j: Juego = Depends(juego)) -> dict[str, Any]:
    return _ejecutar(j.abrir_cofre, cofre_id)


@router.get("/tienda")
def tienda(_: Usuario = Depends(usuario_actual)) -> list[dict[str, Any]]:
    return Juego.tienda()


@router.post("/tienda/comprar")
def comprar(cuerpo: PorItem, j: Juego = Depends(juego)) -> dict[str, Any]:
    return _ejecutar(j.comprar, cuerpo.item_id)


@router.post("/items/usar")
def usar_item(cuerpo: PorItem, j: Juego = Depends(juego)) -> dict[str, Any]:
    efecto = _ejecutar(
        j.usar_item, cuerpo.item_id, intento_id=cuerpo.intento_id, pregunta_id=cuerpo.pregunta_id
    )
    vista = j.vista_estado()
    if efecto is not None:
        vista["efecto"] = efecto
    return vista


@router.post("/mascotas/equipar")
def equipar(cuerpo: PorMascota, j: Juego = Depends(juego)) -> dict[str, Any]:
    _ejecutar(j.equipar, cuerpo.mascota_id)
    return j.vista_estado()


@router.post("/paleta")
def elegir_paleta(cuerpo: PorPaleta, j: Juego = Depends(juego)) -> dict[str, Any]:
    _ejecutar(j.elegir_paleta, cuerpo.paleta_id)
    return j.vista_estado()


@router.post("/equipo")
def equipar_item(cuerpo: PorEquipable, j: Juego = Depends(juego)) -> dict[str, Any]:
    _ejecutar(j.equipar_item, cuerpo.item_id)
    return j.vista_estado()


@router.post("/equipo/quitar")
def quitar_equipo(cuerpo: PorRanura, j: Juego = Depends(juego)) -> dict[str, Any]:
    _ejecutar(j.quitar_equipo, cuerpo.ranura)
    return j.vista_estado()


@router.post("/ajustes")
def ajustes(cuerpo: Ajustes, j: Juego = Depends(juego)) -> dict[str, Any]:
    _ejecutar(j.ajustar, minimo_aprobar=cuerpo.minimo_aprobar)
    return j.vista_estado()
