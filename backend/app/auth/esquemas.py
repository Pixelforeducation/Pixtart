"""Esquemas de entrada/salida de /api/auth."""

from datetime import date

from pydantic import BaseModel, Field


class RegistroEntrada(BaseModel):
    correo: str = Field(max_length=320)
    contrasena: str = Field(max_length=256)
    fecha_nacimiento: date
    zona_horaria: str = Field(default="UTC", max_length=64)


class LoginEntrada(BaseModel):
    correo: str = Field(max_length=320)
    contrasena: str = Field(max_length=256)


class UsuarioBasico(BaseModel):
    id: str
    correo: str


class LoginSalida(BaseModel):
    token: str
    usuario: UsuarioBasico


class YoSalida(BaseModel):
    id: str
    correo: str
    zona_horaria: str
