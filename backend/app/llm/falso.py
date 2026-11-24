"""LLM falso y determinista para tests: nunca llama a la red.

Uso:
    LLMFalso()                        # respuestas por defecto válidas según el esquema pedido
    LLMFalso(respuestas=[{...}, "x"]) # cola: dict → se serializa; str → texto crudo
    LLMFalso(responder=fn)            # fn(sistema, mensajes, esquema) -> dict | str
Guarda cada llamada en `llamadas` para inspeccionar prompts.
"""

import json
import re
from collections.abc import Callable

from app.llm.base import ClienteLLM, Uso


class LLMFalso(ClienteLLM):
    def __init__(
        self,
        respuestas: list | None = None,
        responder: Callable[[str, list[dict], dict], dict | str] | None = None,
        uso_por_llamada: Uso | None = None,
    ):
        self.respuestas = list(respuestas or [])
        self.responder = responder
        self.uso_por_llamada = uso_por_llamada or Uso(100, 50)
        self.llamadas: list[dict] = []

    def _llamar(self, sistema, mensajes, esquema, max_tokens):
        self.llamadas.append(
            {"sistema": sistema, "mensajes": mensajes, "esquema": esquema, "max_tokens": max_tokens}
        )
        if self.respuestas:
            r = self.respuestas.pop(0)
        elif self.responder:
            r = self.responder(sistema, mensajes, esquema)
        else:
            r = respuesta_por_defecto(mensajes, esquema, len(self.llamadas))
        texto = r if isinstance(r, str) else json.dumps(r, ensure_ascii=False)
        u = self.uso_por_llamada
        return texto, Uso(u.tokens_entrada, u.tokens_salida)


def _texto_usuario(mensajes: list[dict]) -> str:
    partes = []
    for m in mensajes:
        if m["role"] == "user":
            c = m["content"]
            partes.append(c if isinstance(c, str) else json.dumps(c))
    return "\n".join(partes)


def respuesta_por_defecto(mensajes: list[dict], esquema: dict, semilla: int = 0) -> dict:
    titulo = esquema.get("title", "")
    texto = _texto_usuario(mensajes)
    if titulo == "estructura_curso":
        return {
            "titulo": "Curso de prueba",
            "tema": "pruebas",
            "secciones": [
                {
                    "titulo": f"Sección {s}",
                    "niveles": [
                        {
                            "titulo": f"Nivel {s}.{n}",
                            "es_calentamiento": n == 0,
                            "resumen": f"Resumen del nivel {s}.{n}",
                            "pagina_inicio": 1,
                            "pagina_fin": 1,
                        }
                        for n in range(3)
                    ],
                }
                for s in (1, 2)
            ],
        }
    if titulo in ("preguntas_nivel", "pregunta_unica"):
        m = re.search(r"exactamente (\d+) pregunta", texto)
        n = int(m.group(1)) if m else 1
        t = re.search(r"Tipos permitidos: ([a-z_, ]+)", texto)
        tipos = [x.strip() for x in t.group(1).split(",")] if t else ["multiple_choice"]
        pregs = [pregunta_ejemplo(tipos[i % len(tipos)], f"{semilla}-{i}") for i in range(n)]
        if titulo == "pregunta_unica":
            return {"pregunta": pregs[0]}
        return {"preguntas": pregs}
    raise ValueError(f"LLMFalso: esquema desconocido {titulo!r}")


def pregunta_ejemplo(tipo: str, sufijo: str = "") -> dict:
    base = {
        "tipo": tipo,
        "enunciado": f"Pregunta de ejemplo {tipo} {sufijo}",
        "opciones": None,
        "respuesta": "",
        "tolerancia": None,
        "explicacion": "Porque así lo dice el documento.",
        "pista": None,
        "dificultad": 2,
        "fuente_pagina": 1,
    }
    if tipo == "multiple_choice":
        base |= {"opciones": ["A", "B", "C", "D"], "respuesta": 1}
    elif tipo == "true_false":
        base |= {"respuesta": True}
    elif tipo in ("fill_text", "fill_code"):
        base |= {"respuesta": ["respuesta"]}
    elif tipo == "numeric":
        base |= {"respuesta": 3.14, "tolerancia": 0.01}
    elif tipo == "ordering":
        base |= {"opciones": ["uno", "dos", "tres"], "respuesta": [0, 1, 2]}
    else:
        base |= {"respuesta": "Texto de referencia."}
    return base
