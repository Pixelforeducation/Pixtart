"""Fixtures del pipeline: almacén en memoria, LLMFalso, keys/uso falsos y usuario simple."""

import json
from contextlib import contextmanager
from dataclasses import dataclass, field

import pytest

from app.llm.falso import LLMFalso
from app.main import app
from app.pipeline import dependencias
from app.pipeline.almacen import AlmacenMemoria
from app.pipeline.dependencias import LimiteExcedido, servicios

KEY = "sk-ant-api03-SECRETA-de-prueba-1234"


@dataclass
class Usuario:
    id: str


@dataclass
class Entorno:
    almacen: AlmacenMemoria = field(default_factory=AlmacenMemoria)
    llm: LLMFalso = field(default_factory=LLMFalso)
    keys: dict = field(default_factory=dict)
    usos: list = field(default_factory=list)
    tope: int | None = None  # tokens totales antes de LimiteExcedido
    limite_previo: bool = False
    invalidadas: list = field(default_factory=list)
    keys_usadas: list = field(default_factory=list)
    ocr: object = None
    usuario: Usuario = field(default_factory=lambda: Usuario("u-1"))

    def como(self, usuario_id: str) -> None:
        self.usuario = Usuario(usuario_id)


@pytest.fixture
def entorno(db, monkeypatch):
    e = Entorno()
    e.keys["u-1"] = KEY
    e.keys["u-2"] = KEY

    def fabrica(key, modelo):
        e.keys_usadas.append(key)
        return e.llm

    def registrar(db_, uid, te, ts):
        e.usos.append((uid, te, ts))
        if e.tope is not None and sum(a + b for _, a, b in e.usos) > e.tope:
            raise LimiteExcedido("Llegaste a tu tope diario de tokens.", "diario")

    def verificar(db_, uid):
        if e.limite_previo:
            raise LimiteExcedido("Llegaste a tu tope mensual de tokens.", "mensual")

    @contextmanager
    def sesion():
        yield db

    monkeypatch.setattr(servicios, "_almacen_cache", e.almacen)
    monkeypatch.setattr(servicios, "fabrica_llm", fabrica)
    monkeypatch.setattr(servicios, "obtener_key", lambda db_, uid: e.keys.get(uid))
    monkeypatch.setattr(servicios, "obtener_modelo", lambda db_, uid: None)
    monkeypatch.setattr(servicios, "verificar_limite", verificar)
    monkeypatch.setattr(servicios, "registrar_uso", registrar)
    monkeypatch.setattr(servicios, "marcar_key_invalida", lambda db_, uid: e.invalidadas.append(uid))
    monkeypatch.setattr(servicios, "obtener_ocr", lambda: e.ocr)
    monkeypatch.setattr(servicios, "sesion", sesion)
    app.dependency_overrides[dependencias.usuario_actual] = lambda: e.usuario
    return e


CONFIG = {
    "num_preguntas": 20,
    "dificultad": 3,
    "tipos": ["multiple_choice", "true_false", "numeric"],
    "instrucciones": "Enfócate en cuantificadores.",
    "repaso": "leitner",
}


def subir(client, pdf: bytes, config: dict | None = None, nombre="apuntes.pdf"):
    return client.post(
        "/api/cursos",
        files={"pdf": (nombre, pdf, "application/pdf")},
        data={"config": json.dumps(config or CONFIG)},
    )


def subir_varios(client, archivos: list[tuple[str, bytes]], config: dict | None = None):
    """Varios PDFs con el campo multipart `pdf` repetido."""
    return client.post(
        "/api/cursos",
        files=[("pdf", (nombre, datos, "application/pdf")) for nombre, datos in archivos],
        data={"config": json.dumps(config or CONFIG)},
    )
