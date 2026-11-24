from datetime import date

import pytest

from app.ejemplo.curso_regex import CURSO, sembrar
from app.models.usuarios import Usuario


@pytest.fixture
def usuario(db):
    u = Usuario(correo="ana@example.com", hash_contrasena="x", fecha_nacimiento=date(1999, 1, 1),
                zona_horaria="America/Mexico_City")
    db.add(u)
    db.commit()
    return u


def test_curso_de_ejemplo_valido_y_completo(db, usuario):
    curso = sembrar(db, "ANA@example.com")
    assert curso.estado == "publicado"
    preguntas = [p for s in curso.secciones for n in s.niveles for p in n.preguntas]
    assert len(preguntas) == sum(len(ps) for _, nivs in CURSO for _, _, ps in nivs)
    assert all(p.valida for p in preguntas)
    tipos = {p.tipo for p in preguntas}
    assert tipos >= {"multiple_choice", "true_false", "fill_text", "fill_code", "numeric",
                     "ordering", "open", "math_problem", "proof"}
    assert all(s.niveles[0].es_calentamiento for s in curso.secciones)
    orden = next(p for p in preguntas if p.tipo == "ordering")
    assert orden.respuesta != list(range(len(orden.opciones)))  # barajado: no viene resuelto
    assert {p.tiempo_s for p in preguntas if p.tipo in ("math_problem", "proof")} == {900}


def test_no_duplica_y_reemplaza(db, usuario):
    a = sembrar(db, "ana@example.com")
    assert sembrar(db, "ana@example.com").id == a.id
    b = sembrar(db, "ana@example.com", reemplazar=True)
    assert b.id != a.id


def test_usuario_inexistente(db):
    with pytest.raises(LookupError):
        sembrar(db, "nadie@example.com")


def test_se_puede_jugar(client, db, usuario):
    from app.auth.deps import usuario_actual
    from app.main import app

    curso = sembrar(db, "ana@example.com")
    app.dependency_overrides[usuario_actual] = lambda: usuario
    camino = client.get(f"/api/juego/cursos/{curso.id}/camino")
    assert camino.status_code == 200
    nivel = camino.json()["secciones"][0]["niveles"][0]
    r = client.post(f"/api/juego/niveles/{nivel['id']}/iniciar")
    assert r.status_code == 200 and r.json()["preguntas"]
