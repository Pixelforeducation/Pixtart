"""Pruebas de la capa LLM: validador de esquema, reintento, LLMFalso y ClienteAnthropic
(con un cliente del SDK falso: nunca se llama a la red)."""

import json
from types import SimpleNamespace

import anthropic
import pytest

from app.llm.anthropic_cliente import MODELO_POR_DEFECTO, ClienteAnthropic
from app.llm.base import ErrorLLM, SalidaInvalida
from app.llm.esquema import errores_esquema, esquema_para_api
from app.llm.falso import LLMFalso
from app.pipeline import prompts

KEY = "sk-ant-api03-NO-DEBE-APARECER-9999"


def test_validador_esquema():
    e = prompts.ESQUEMA_PREGUNTAS
    assert errores_esquema({"preguntas": []}, e)  # minItems 1
    assert errores_esquema({"preguntas": [{"tipo": "open"}]}, e)
    ok = LLMFalso().generar_json("s", [{"role": "user", "content":
                                        "Genera exactamente 2 preguntas\nTipos permitidos: open"}],
                                 e)[0]
    assert errores_esquema(ok, e) == []
    malo = json.loads(json.dumps(ok))
    malo["preguntas"][0]["extra"] = 1
    malo["preguntas"][0]["dificultad"] = 7
    errs = errores_esquema(malo, e)
    assert any("no permitida" in x for x in errs) and any("mayor que" in x for x in errs)
    assert errores_esquema(True, {"type": "integer"})  # bool no es entero


def test_esquema_para_api_quita_restricciones_no_soportadas():
    api = esquema_para_api(prompts.ESQUEMA_ESTRUCTURA)
    texto = json.dumps(api)
    for k in ('"title"', '"maxLength"', '"minimum"', '"maxItems"'):
        assert k not in texto
    assert api["properties"]["secciones"]["minItems"] == 1
    assert api["additionalProperties"] is False


def test_reintento_una_vez():
    llm = LLMFalso(respuestas=["nope", {"pregunta": None}])
    with pytest.raises(SalidaInvalida) as e:
        llm.generar_json("s", [{"role": "user", "content": "x"}], prompts.ESQUEMA_PREGUNTA_UNICA)
    assert len(llm.llamadas) == 2
    assert e.value.uso.tokens_entrada == 200


def test_llm_falso_cola_y_responder():
    llm = LLMFalso(respuestas=[{"a": 1}], responder=lambda s, m, e: {"a": 2})
    esquema = {"type": "object", "properties": {"a": {"type": "integer"}}, "required": ["a"]}
    assert llm.generar_json("s", [], esquema)[0] == {"a": 1}
    assert llm.generar_json("s", [], esquema)[0] == {"a": 2}


class _SDKFalso:
    def __init__(self, resultado):
        self.resultado = resultado
        self.kwargs = None
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.kwargs = kwargs
        if isinstance(self.resultado, Exception):
            raise self.resultado
        return self.resultado


def _respuesta(texto, stop="end_turn"):
    return SimpleNamespace(
        content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=texto)],
        usage=SimpleNamespace(input_tokens=11, output_tokens=7),
        stop_reason=stop,
    )


def _cliente(resultado):
    c = ClienteAnthropic(KEY)
    sdk = _SDKFalso(resultado)
    c._cliente = sdk
    return c, sdk


ESQ = {"type": "object", "properties": {"a": {"type": "integer", "maximum": 5}},
       "required": ["a"], "additionalProperties": False, "title": "x"}


def test_cliente_anthropic_ok():
    c, sdk = _cliente(_respuesta('{"a": 3}'))
    datos, uso = c.generar_json("sistema", [{"role": "user", "content": "hola"}], ESQ, 1000)
    assert datos == {"a": 3} and (uso.tokens_entrada, uso.tokens_salida) == (11, 7)
    k = sdk.kwargs
    assert k["model"] == MODELO_POR_DEFECTO == "claude-sonnet-5-5"
    assert k["system"] == "sistema" and k["max_tokens"] == 1000
    assert k["output_config"]["format"]["type"] == "json_schema"
    assert "maximum" not in json.dumps(k["output_config"])
    assert KEY not in repr(c)


def test_cliente_anthropic_reintenta_si_no_valida():
    c, sdk = _cliente(_respuesta('{"a": 9}'))  # viola maximum → reintento → falla
    with pytest.raises(SalidaInvalida) as e:
        c.generar_json("s", [{"role": "user", "content": "x"}], ESQ)
    assert e.value.uso.tokens_entrada == 22
    assert sdk.kwargs["messages"][-1]["role"] == "user"


def test_cliente_anthropic_refusal():
    c, _ = _cliente(_respuesta("", stop="refusal"))
    with pytest.raises(ErrorLLM) as e:
        c.generar_json("s", [], ESQ)
    assert "negó" in e.value.mensaje_usuario and e.value.uso.tokens_entrada == 11


def _error_http(cls, status):
    import httpx2

    req = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    return cls(f"fallo {KEY}", response=httpx2.Response(status, request=req), body=None)


@pytest.mark.parametrize(
    "exc,rechazada",
    [
        (_error_http(anthropic.AuthenticationError, 401), True),
        (_error_http(anthropic.PermissionDeniedError, 403), True),
        (_error_http(anthropic.RateLimitError, 429), False),
        (_error_http(anthropic.InternalServerError, 500), False),
    ],
)
def test_cliente_anthropic_errores(exc, rechazada):
    c, _ = _cliente(exc)
    with pytest.raises(ErrorLLM) as e:
        c.generar_json("s", [], ESQ)
    assert e.value.key_rechazada is rechazada
    assert KEY not in e.value.mensaje_usuario


def test_cliente_anthropic_peticion_real_con_transporte_falso():
    """Usa el SDK de verdad con un transporte httpx falso para comprobar la petición."""
    import httpx2

    capturado = {}

    def manejar(req):
        capturado["cuerpo"] = json.loads(req.content)
        capturado["cabeceras"] = dict(req.headers)
        return httpx2.Response(200, json={
            "id": "m", "type": "message", "role": "assistant", "model": "claude-sonnet-5-5",
            "content": [{"type": "text", "text": '{"a": 1}'}], "stop_reason": "end_turn",
            "stop_sequence": None, "usage": {"input_tokens": 3, "output_tokens": 2},
        })

    c = ClienteAnthropic(KEY)
    c._cliente = anthropic.Anthropic(
        api_key=KEY,
        http_client=anthropic.DefaultHttpxClient(transport=httpx2.MockTransport(manejar)),
    )
    datos, _ = c.generar_json("s", [{"role": "user", "content": "x"}], ESQ)
    assert datos == {"a": 1}
    cuerpo = capturado["cuerpo"]
    assert cuerpo["model"] == "claude-sonnet-5-5" and cuerpo["fallbacks"] == "default"
    assert cuerpo["output_config"]["format"]["schema"]["additionalProperties"] is False
    assert KEY not in json.dumps(cuerpo)
