"""Cliente de Anthropic (SDK oficial) con salida JSON estructurada.

La API key llega en el constructor (BYOK, descifrada por app.keys) y NUNCA se loguea ni se
incluye en mensajes de error.
"""

import logging

import anthropic

from app.llm.base import ClienteLLM, ErrorLLM, Uso
from app.llm.esquema import esquema_para_api

log = logging.getLogger(__name__)

MODELO_POR_DEFECTO = "claude-sonnet-5-5"
_BETA_FALLBACK = "server-side-fallback-2026-07-01"


class ClienteAnthropic(ClienteLLM):
    def __init__(self, api_key: str, modelo: str | None = None, timeout: float = 600.0):
        self._cliente = anthropic.Anthropic(api_key=api_key, timeout=timeout, max_retries=2)
        self.modelo = modelo or MODELO_POR_DEFECTO

    def __repr__(self) -> str:  # evita que la key acabe en un log por accidente
        return f"ClienteAnthropic(modelo={self.modelo!r})"

    def _llamar(
        self, sistema: str, mensajes: list[dict], esquema: dict, max_tokens: int
    ) -> tuple[str, Uso]:
        try:
            resp = self._cliente.beta.messages.create(
                model=self.modelo,
                max_tokens=max_tokens,
                system=sistema,
                messages=mensajes,
                output_config={
                    "format": {"type": "json_schema", "schema": esquema_para_api(esquema)}
                },
                betas=[_BETA_FALLBACK],
                fallbacks="default",
            )
        except anthropic.AuthenticationError as e:
            raise ErrorLLM(
                "Tu API key de Anthropic fue rechazada. Revísala en Ajustes.", key_rechazada=True
            ) from e
        except anthropic.PermissionDeniedError as e:
            raise ErrorLLM(
                "Tu API key no tiene permiso para usar este modelo.", key_rechazada=True
            ) from e
        except anthropic.RateLimitError as e:
            raise ErrorLLM("Anthropic limitó la velocidad de tu key. Intenta más tarde.") from e
        except anthropic.BadRequestError as e:
            log.warning("Anthropic rechazó la petición: status=%s", e.status_code)
            raise ErrorLLM("Anthropic rechazó la petición de generación.") from e
        except anthropic.APIStatusError as e:
            log.warning("Error de Anthropic: status=%s", e.status_code)
            raise ErrorLLM("Anthropic no respondió correctamente. Intenta más tarde.") from e
        except anthropic.APIConnectionError as e:
            raise ErrorLLM("No se pudo conectar con Anthropic. Intenta más tarde.") from e

        uso = Uso(resp.usage.input_tokens or 0, resp.usage.output_tokens or 0)
        if resp.stop_reason == "refusal":
            raise ErrorLLM("La IA se negó a procesar este contenido.", uso)
        if resp.stop_reason == "max_tokens":
            raise ErrorLLM("La respuesta de la IA se cortó por longitud.", uso)
        texto = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        return texto, uso
