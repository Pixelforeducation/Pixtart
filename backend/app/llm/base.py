"""Interfaz común de los clientes LLM.

`generar_json` pide una salida JSON, la valida contra el esquema y, si no valida, reintenta
UNA vez diciéndole al modelo qué falló. Si vuelve a fallar lanza `SalidaInvalida`.
El uso de tokens se acumula entre intentos (también se informa cuando falla).
"""

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.llm.esquema import errores_esquema


@dataclass
class Uso:
    tokens_entrada: int = 0
    tokens_salida: int = 0

    def __add__(self, otro: "Uso") -> "Uso":
        return Uso(
            self.tokens_entrada + otro.tokens_entrada, self.tokens_salida + otro.tokens_salida
        )


class ErrorLLM(Exception):
    """Fallo al llamar al modelo. `mensaje_usuario` es seguro de mostrar (sin la key)."""

    def __init__(
        self, mensaje_usuario: str, uso: Uso | None = None, key_rechazada: bool = False
    ):
        super().__init__(mensaje_usuario)
        self.mensaje_usuario = mensaje_usuario
        self.uso = uso or Uso()
        self.key_rechazada = key_rechazada  # 401/403 del proveedor


class SalidaInvalida(ErrorLLM):
    """El modelo devolvió dos veces algo que no cumple el esquema."""


class ClienteLLM(ABC):
    reintentos_validacion = 1

    @abstractmethod
    def _llamar(
        self, sistema: str, mensajes: list[dict], esquema: dict, max_tokens: int
    ) -> tuple[str, Uso]:
        """Una llamada al modelo. Devuelve el texto crudo (debería ser JSON) y el uso."""

    def generar_json(
        self, sistema: str, mensajes: list[dict], esquema: dict, max_tokens: int = 16000
    ) -> tuple[dict, Uso]:
        uso_total = Uso()
        conversacion = list(mensajes)
        problemas: list[str] = []
        for _ in range(self.reintentos_validacion + 1):
            texto, uso = self._llamar(sistema, conversacion, esquema, max_tokens)
            uso_total = uso_total + uso
            try:
                datos = json.loads(texto)
                problemas = errores_esquema(datos, esquema)
            except (json.JSONDecodeError, TypeError):
                datos, problemas = None, ["la respuesta no es JSON válido"]
            if not problemas:
                return datos, uso_total
            conversacion = conversacion + [
                {"role": "assistant", "content": texto or "(vacío)"},
                {
                    "role": "user",
                    "content": "Tu respuesta no cumple el esquema JSON pedido. Errores: "
                    + "; ".join(problemas[:20])
                    + ". Responde de nuevo SOLO con el JSON corregido.",
                },
            ]
        raise SalidaInvalida(
            "La IA devolvió una respuesta con formato inválido dos veces. Intenta de nuevo.",
            uso_total,
        )
