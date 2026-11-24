"""Endpoints /api/keys: alta (validada), listado, borrado y límites de uso."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.auth.deps import usuario_actual
from app.core.db import get_db
from app.keys import service
from app.keys.esquemas import KeyEntrada, KeySalida, LimitesEntrada, LimitesSalida
from app.keys.validador import KeyInvalida, ValidadorKey, obtener_validador
from app.models.usuarios import ApiKey, Usuario

router = APIRouter(prefix="/api/keys", tags=["keys"])


def _salida(k: ApiKey) -> KeySalida:
    return KeySalida(
        id=k.id,
        proveedor=k.proveedor,
        modelo=k.modelo,
        ultimos4=k.ultimos4,
        estado=k.estado,
        creada=k.created_at,
    )


def _limites(db: Session, usuario_id: str) -> LimitesSalida:
    lim = service.obtener_limites(db, usuario_id)
    hoy, mes = service.usados(db, usuario_id)
    return LimitesSalida(
        tope_diario_tokens=lim.tope_diario_tokens,
        tope_mensual_tokens=lim.tope_mensual_tokens,
        usados_hoy=hoy,
        usados_mes=mes,
    )


@router.get("", response_model=list[KeySalida])
def listar(usuario: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)):
    return [_salida(k) for k in service.listar_keys(db, usuario.id)]


@router.post("", status_code=status.HTTP_201_CREATED, response_model=KeySalida)
def crear(
    datos: KeyEntrada,
    usuario: Usuario = Depends(usuario_actual),
    db: Session = Depends(get_db),
    validador: ValidadorKey = Depends(obtener_validador),
):
    try:
        k = service.guardar_key(
            db, usuario.id, datos.proveedor, datos.api_key.get_secret_value(), datos.modelo,
            validador,
        )
    except KeyInvalida as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.mensaje) from None
    return _salida(k)


@router.get("/limites", response_model=LimitesSalida)
def ver_limites(usuario: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)):
    return _limites(db, usuario.id)


@router.put("/limites", response_model=LimitesSalida)
def cambiar_limites(
    datos: LimitesEntrada,
    usuario: Usuario = Depends(usuario_actual),
    db: Session = Depends(get_db),
):
    service.actualizar_limites(db, usuario.id, datos.tope_diario_tokens, datos.tope_mensual_tokens)
    return _limites(db, usuario.id)


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def borrar(
    key_id: str, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)
) -> Response:
    if not service.borrar_key(db, usuario.id, key_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No encontramos esa key.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
