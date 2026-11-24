"""Validación de una API key con una llamada mínima al proveedor.

En tests se sustituye `obtener_validador` con `app.dependency_overrides` por un validador falso.
"""

from typing import Protocol

import anthropic

MODELO_POR_DEFECTO = {"anthropic": "claude-haiku-5-5"}


class KeyInvalida(Exception):
    """La key (o el modelo) no pasó la validación. `mensaje` es apto para el usuario."""

    def __init__(self, mensaje: str):
        super().__init__(mensaje)
        self.mensaje = mensaje


class ValidadorKey(Protocol):
    def validar(self, proveedor: str, api_key: str, modelo: str) -> None:
        """No devuelve nada si la key sirve; lanza `KeyInvalida` si no."""
        ...


class ValidadorAnthropic:
    """Consulta el modelo elegido (`GET /v1/models/{id}`): valida key y modelo sin gastar tokens."""

    def __init__(self, timeout_s: float = 10.0, http_client: anthropic.DefaultHttpxClient | None = None):
        self.timeout_s = timeout_s
        self.http_client = http_client  # solo para tests (transporte simulado)

    def validar(self, proveedor: str, api_key: str, modelo: str) -> None:
        if proveedor != "anthropic":
            raise KeyInvalida("Por ahora solo se admiten keys de Anthropic.")
        cliente = anthropic.Anthropic(
            api_key=api_key, timeout=self.timeout_s, max_retries=1, http_client=self.http_client
        )
        try:
            cliente.models.retrieve(modelo)
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError):
            raise KeyInvalida("Anthropic rechazó la key. Revisa que esté bien copiada y activa.")
        except anthropic.NotFoundError:
            raise KeyInvalida(f"El modelo «{modelo}» no existe o tu key no tiene acceso a él.")
        except anthropic.APIError:
            # Sin encadenar la excepción: podría arrastrar cabeceras con la key.
            raise KeyInvalida(
                "No pudimos comprobar la key con Anthropic en este momento. Inténtalo más tarde."
            ) from None
        finally:
            if self.http_client is None:
                cliente.close()


def obtener_validador() -> ValidadorKey:
    return ValidadorAnthropic()
