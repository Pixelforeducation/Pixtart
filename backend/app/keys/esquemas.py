"""Esquemas de entrada/salida de /api/keys. La key nunca aparece en una salida."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, SecretStr


class KeyEntrada(BaseModel):
    proveedor: Literal["anthropic"]
    # SecretStr y sin restricciones de Field: así un error 422 nunca devuelve la key en `input`.
    # La longitud se comprueba en el servicio (400).
    api_key: SecretStr
    modelo: str | None = Field(default=None, min_length=1, max_length=128)


class KeySalida(BaseModel):
    id: str
    proveedor: str
    modelo: str
    ultimos4: str
    estado: Literal["activa", "invalida"]
    creada: datetime


class LimitesEntrada(BaseModel):
    tope_diario_tokens: int = Field(ge=0, le=1_000_000_000)
    tope_mensual_tokens: int = Field(ge=0, le=10_000_000_000)


class LimitesSalida(BaseModel):
    tope_diario_tokens: int
    tope_mensual_tokens: int
    usados_hoy: int
    usados_mes: int
