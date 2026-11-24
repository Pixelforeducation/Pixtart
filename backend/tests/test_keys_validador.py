"""ValidadorAnthropic contra un transporte HTTP simulado (sin red)."""

import anthropic
import httpx2 as httpx  # el SDK de anthropic usa httpx2
import pytest

from app.keys.validador import KeyInvalida, ValidadorAnthropic


def _validador(codigo):
    vistos = []

    def responder(req: httpx.Request) -> httpx.Response:
        vistos.append(req)
        if codigo == 200:
            return httpx.Response(
                200,
                json={
                    "type": "model",
                    "id": "claude-haiku-5-5",
                    "display_name": "Haiku",
                    "created_at": "2026-01-01T00:00:00Z",
                },
            )
        return httpx.Response(codigo, json={"type": "error", "error": {"type": "x", "message": "x"}})

    cliente = anthropic.DefaultHttpxClient(transport=httpx.MockTransport(responder))
    return ValidadorAnthropic(http_client=cliente), vistos


def test_key_valida():
    v, vistos = _validador(200)
    v.validar("anthropic", "sk-ant-buena-1234", "claude-haiku-5-5")
    assert vistos[0].url.path == "/v1/models/claude-haiku-5-5"


@pytest.mark.parametrize(
    "codigo,fragmento", [(401, "rechazó"), (403, "rechazó"), (404, "modelo"), (500, "más tarde")]
)
def test_errores(codigo, fragmento):
    v, _ = _validador(codigo)
    with pytest.raises(KeyInvalida) as e:
        v.validar("anthropic", "sk-ant-mala-1234", "claude-haiku-5-5")
    assert fragmento in e.value.mensaje
    assert "sk-ant-mala" not in e.value.mensaje


def test_proveedor_no_soportado():
    with pytest.raises(KeyInvalida):
        ValidadorAnthropic().validar("openai", "sk-1234567890", "gpt")
