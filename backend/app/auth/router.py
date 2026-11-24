"""Endpoints /api/auth: registro, login y yo."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import service
from app.auth.deps import hoy, usuario_actual
from app.auth.esquemas import LoginEntrada, LoginSalida, RegistroEntrada, UsuarioBasico, YoSalida
from app.auth.seguridad import crear_token
from app.core.db import get_db
from app.models.usuarios import Usuario

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/registro", status_code=status.HTTP_201_CREATED, response_model=UsuarioBasico)
def registro(
    datos: RegistroEntrada, db: Session = Depends(get_db), fecha_hoy: date = Depends(hoy)
) -> UsuarioBasico:
    try:
        u = service.registrar(
            db, datos.correo, datos.contrasena, datos.fecha_nacimiento, datos.zona_horaria,
            fecha_hoy,
        )
    except service.ErrorRegistro as e:
        codigo = status.HTTP_409_CONFLICT if e.conflicto else 422
        raise HTTPException(status_code=codigo, detail=e.mensaje)
    return UsuarioBasico(id=u.id, correo=u.correo)


@router.post("/login", response_model=LoginSalida)
def login(datos: LoginEntrada, db: Session = Depends(get_db)) -> LoginSalida:
    u = service.autenticar(db, datos.correo, datos.contrasena)
    if u is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Correo o contraseña incorrectos."
        )
    return LoginSalida(token=crear_token(u.id), usuario=UsuarioBasico(id=u.id, correo=u.correo))


@router.get("/yo", response_model=YoSalida)
def yo(usuario: Usuario = Depends(usuario_actual)) -> YoSalida:
    return YoSalida(id=usuario.id, correo=usuario.correo, zona_horaria=usuario.zona_horaria)
