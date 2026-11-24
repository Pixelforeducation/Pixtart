"""FuenteCursosSQL contra las tablas reales de `app.models.cursos` y un flujo por la API."""

import random
from datetime import UTC, datetime

import pytest
from fastapi import Request

from app.auth.deps import usuario_actual
from app.main import app
from app.models.cursos import Curso, Nivel, Pregunta, Seccion
from app.models.usuarios import Usuario
from app.play import deps
from app.play.fuente_cursos import FuenteCursosSQL

T0 = datetime(2026, 11, 24, 15, 0, tzinfo=UTC)


@pytest.fixture
def datos(db):
    u = Usuario(correo="s@x.com", hash_contrasena="x", fecha_nacimiento=T0.date())
    otro = Usuario(correo="o@x.com", hash_contrasena="x", fecha_nacimiento=T0.date())
    db.add_all([u, otro])
    db.flush()
    c = Curso(usuario_id=u.id, titulo="Álgebra", tema="algebra", estado="publicado",
              config={"repaso": "leitner"})
    borrador = Curso(usuario_id=u.id, titulo="B", tema="b", estado="borrador")
    db.add_all([c, borrador])
    db.flush()
    s = Seccion(curso_id=c.id, titulo="S", orden=0)
    db.add(s)
    db.flush()
    n = Nivel(seccion_id=s.id, titulo="N1", orden=0)
    db.add(n)
    db.flush()
    db.add_all([
        Pregunta(nivel_id=n.id, orden=0, tipo="multiple_choice", enunciado="¿1+1?",
                 opciones=["1", "2"], respuesta=1, explicacion="Suma", tiempo_s=20, valida=True),
        Pregunta(nivel_id=n.id, orden=1, tipo="true_false", enunciado="¿Mala?", respuesta=True,
                 tiempo_s=20, valida=False),
    ])
    db.commit()
    return {"u": u, "otro": otro, "curso": c, "borrador": borrador, "nivel": n}


def test_fuente_sql(db, datos):
    f = FuenteCursosSQL()
    camino = f.camino(db, datos["u"].id, datos["curso"].id)
    assert camino.tema == "algebra" and camino.niveles()[0][1].id == datos["nivel"].id
    assert f.camino(db, datos["u"].id, datos["borrador"].id) is None
    assert f.camino(db, datos["otro"].id, datos["curso"].id) is None
    ps = f.preguntas(db, datos["u"].id, datos["nivel"].id)
    assert [p.pregunta.enunciado for p in ps] == ["¿1+1?"]  # solo válidas
    assert ps[0].explicacion == "Suma" and ps[0].tiempo_s == 20
    assert f.preguntas(db, datos["otro"].id, datos["nivel"].id) == []


def test_flujo_api_con_fuente_sql(client, db, datos):
    def usuario_test(request: Request) -> Usuario:
        return db.get(Usuario, request.headers["x-usuario"])

    app.dependency_overrides[usuario_actual] = usuario_test
    app.dependency_overrides[deps.ahora] = lambda: T0
    app.dependency_overrides[deps.rng] = lambda: random.Random(1)
    h = {"x-usuario": datos["u"].id}
    r = client.get(f"/api/juego/cursos/{datos['curso'].id}/camino", headers=h)
    assert r.json()["secciones"][0]["niveles"][0]["estado"] == "actual"
    ini = client.post(f"/api/juego/niveles/{datos['nivel'].id}/iniciar", headers=h).json()
    (p,) = ini["preguntas"]
    r = client.post(f"/api/juego/intentos/{ini['intento_id']}/responder",
                    json={"pregunta_id": p["id"], "respuesta": 1, "tiempo_ms": 500}, headers=h)
    assert r.json()["correcta"] is True
    fin = client.post(f"/api/juego/intentos/{ini['intento_id']}/terminar", headers=h).json()
    assert fin["perfecto"] is True
    h2 = {"x-usuario": datos["otro"].id}
    assert client.get(f"/api/juego/cursos/{datos['curso'].id}/camino",
                      headers=h2).status_code == 404

