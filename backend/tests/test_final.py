"""Nivel final (examen-aventura): reglas puras y endpoints de juego."""

import random
from datetime import UTC, date, datetime

import pytest
from fastapi import Request

from app.auth.deps import usuario_actual
from app.game.tipos import Pregunta, TipoPregunta
from app.main import app
from app.models.juego import EstadoJugador, NivelCompletado
from app.models.usuarios import Usuario
from app.play import deps, final
from app.play.fuente_cursos import (
    CaminoCurso,
    CursoMemoria,
    FuenteCursosMemoria,
    NivelInfo,
    PreguntaFuente,
    SeccionInfo,
)
from app.play.pista import GeneradorPistaFalso

T0 = datetime(2026, 11, 24, 15, 0, tzinfo=UTC)
T = TipoPregunta

# ---------------------------------------------------------------- reglas puras


def test_requeridas_y_margen():
    assert final.requeridas(20, 70) == 14  # ejemplo del spec: 14 y 6 corazones
    assert final.requeridas(3, 60) == 2
    assert final.requeridas(40, 100) == 40
    assert final.requeridas(10, 65) == 7  # ceil(6.5)
    assert final.requeridas(7, 70) == 5  # ceil(4.9), sin errores de coma flotante


def test_acotar_configuracion():
    assert final.acotar_n(50) == 40 and final.acotar_n(1) == 3 and final.acotar_n("x") == 10
    assert final.acotar_g(30) == 60 and final.acotar_g(120) == 100 and final.acotar_g(None) == 70


@pytest.mark.parametrize("n", range(1, 41))
def test_plan_reparte_todas_las_preguntas(n):
    plan = final.plan_encuentros(n)
    assert sum(e["cuantas"] for e in plan) == n
    assert plan[-1]["tipo"] == "jefe" and all(e["tipo"] != "jefe" for e in plan[:-1])
    desde = 0
    for e in plan:
        assert e["desde"] == desde
        assert e["cuantas"] == {"comun": 1, "raro": 2}.get(e["tipo"], e["cuantas"])
        desde += e["cuantas"]
    jefe = plan[-1]
    if n >= 4:
        assert jefe["cuantas"] >= 2 and jefe["desde"] < jefe["fase2_desde"] < n


def test_plan_con_n_3_y_10():
    assert [e["tipo"] for e in final.plan_encuentros(3)] == ["comun", "comun", "jefe"]
    plan = final.plan_encuentros(10)
    assert [e["tipo"] for e in plan] == ["comun", "comun", "raro", "comun", "comun", "jefe"]
    assert plan[-1] == {"tipo": "jefe", "desde": 6, "cuantas": 4, "fase2_desde": 8}


def _e(correcta=None):
    return {"respondida": correcta is not None, "correcta": correcta}


def test_progreso_victoria_temprana_y_derrota_imposible():
    # N=5, g=60 → requeridas 3, margen 2
    p = final.progreso([_e(True), _e(True), _e(True), _e(), _e()], 3)
    assert p["resultado"] == "victoria" and p["restantes"] == 2
    p = final.progreso([_e(False), _e(False), _e(), _e(), _e()], 3)
    assert p["resultado"] == "en_curso" and p["corazones"] == 0
    p = final.progreso([_e(False), _e(False), _e(False), _e(), _e()], 3)
    assert p["resultado"] == "derrota"
    assert final.progreso([_e(False)] + [_e()] * 4, 5)["resultado"] == "derrota"  # g=100 %


def test_tiempo_furia():
    assert final.tiempo_furia(40) == 30
    assert final.tiempo_furia(9) == final.TIEMPO_MIN_FURIA_S


# ---------------------------------------------------------------- API


def _pregs(nivel: str, cuantas: int, dif: int = 2) -> list[PreguntaFuente]:
    """MC con respuesta 1; dificultad creciente con el índice."""
    return [
        PreguntaFuente(
            Pregunta(f"{nivel}-{i}", T.MULTIPLE_CHOICE, f"{nivel} P{i}", 1, ("a", "b", "c"),
                     dificultad=min(5, dif + i // 3)),
            f"Explicación {i}",
            40,
        )
        for i in range(cuantas)
    ]


def _curso(usuario_id: str, n: int, g: int) -> CursoMemoria:
    s1 = SeccionInfo("S1", "Básicos", 0, (
        NivelInfo("CAL", "Calentamiento", 0, es_calentamiento=True),
        NivelInfo("L1", "Lección 1", 1),
        NivelInfo("FIN", "Nivel final", 2, es_final=True),
    ))
    s2 = SeccionInfo("S2", "Más", 1, (NivelInfo("L2", "Lección 2", 0),))
    camino = CaminoCurso("C1", "Curso", "regex", (s1, s2), final_n=n, final_g=g)
    abierta = PreguntaFuente(Pregunta("L1-ab", T.OPEN, "Explica", "ref"), "ref", 60)
    preguntas = {
        "CAL": _pregs("CAL", 3, 1),
        "L1": _pregs("L1", 6) + [abierta],
        "FIN": _pregs("FIN", 4, 3),
        "L2": _pregs("L2", 3),
    }
    return CursoMemoria(camino, usuario_id, True, preguntas)


@pytest.fixture
def entorno(client, db):
    u = Usuario(correo="f@x.com", hash_contrasena="x", fecha_nacimiento=date(1990, 1, 1),
                zona_horaria="UTC")
    db.add(u)
    db.commit()
    fuente = FuenteCursosMemoria([_curso(u.id, 10, 70)])

    def usuario_test(request: Request) -> Usuario:
        return db.get(Usuario, u.id)

    app.dependency_overrides[usuario_actual] = usuario_test
    app.dependency_overrides[deps.fuente_cursos] = lambda: fuente
    app.dependency_overrides[deps.ahora] = lambda: T0
    app.dependency_overrides[deps.rng] = lambda: random.Random(3)
    app.dependency_overrides[deps.generador_pista] = lambda: GeneradorPistaFalso("x")

    class E:
        pass

    e = E()
    e.client, e.db, e.fuente, e.u = client, db, fuente, u
    return e


def _post(e, ruta, json=None):
    return e.client.post(f"/api/juego{ruta}", json=json)


def _desbloquear(e):
    for nivel in ("CAL", "L1"):
        d = _post(e, f"/niveles/{nivel}/iniciar").json()
        for p in d["preguntas"]:
            _post(e, f"/intentos/{d['intento_id']}/responder",
                  {"pregunta_id": p["id"], "respuesta": True if p["tipo"] == "open" else 1,
                   "tiempo_ms": 1000})
        assert _post(e, f"/intentos/{d['intento_id']}/terminar").status_code == 200


def _responder(e, d, i, bien):
    p = d["preguntas"][i]
    r = _post(e, f"/intentos/{d['intento_id']}/responder",
              {"pregunta_id": p["id"], "respuesta": 1 if bien else 0, "tiempo_ms": 1000})
    return r


def test_camino_marca_final_y_bloqueado(entorno):
    secciones = entorno.client.get("/api/juego/cursos/C1/camino").json()["secciones"]
    fin = secciones[0]["niveles"][-1]
    assert fin == {"id": "FIN", "titulo": "Nivel final", "estado": "bloqueado", "tipo": "final"}
    assert _post(entorno, "/niveles/FIN/iniciar").status_code == 409


def test_iniciar_final_aplica_n_y_g(entorno):
    e = entorno
    _desbloquear(e)
    r = _post(e, "/niveles/FIN/iniciar")
    assert r.status_code == 200, r.text
    d = r.json()
    f = d["final"]
    assert f["n"] == 10 and f["g"] == 70 and f["requeridas"] == 7 and f["margen"] == 3
    assert f["corazones"] == 3 and f["resultado"] == "en_curso"
    assert len(d["preguntas"]) == 10
    ids = [p["id"] for p in d["preguntas"]]
    assert "L1-ab" not in ids  # sin abiertas en el examen
    assert all(i.split("-")[0] in ("FIN", "L1", "CAL") for i in ids)  # solo de su sección
    assert all("respuesta" not in p for p in d["preguntas"])
    difs = [p["dificultad"] for p in d["preguntas"]]
    assert difs == sorted(difs)  # el jefe se queda con las más difíciles
    jefe = f["encuentros"][-1]
    assert jefe["tipo"] == "jefe" and jefe["fase2_desde"] == 8
    tiempos = [p["tiempo_s"] for p in d["preguntas"]]
    assert tiempos[:8] == [40] * 8 and tiempos[8:] == [30, 30]  # gimmick: furia del jefe


def test_victoria_temprana_cofre_legendario_y_xp_de_jefe(entorno):
    e = entorno
    _desbloquear(e)
    vidas = e.client.get("/api/juego/estado").json()["vidas"]
    d = _post(e, "/niveles/FIN/iniciar").json()
    assert _responder(e, d, 0, False).json()["final"]["corazones"] == 2
    for i in range(1, 7):
        f = _responder(e, d, i, True).json()["final"]
        assert f["resultado"] == "en_curso"
    r = _responder(e, d, 7, True).json()
    assert r["final"]["resultado"] == "victoria" and r["final"]["restantes"] == 2
    assert r["vidas"] == vidas  # el fallo no cuesta vidas de mascota (Q106)
    assert _responder(e, d, 8, True).status_code == 200  # bonus opcional (Q37)
    fin = _post(e, f"/intentos/{d['intento_id']}/terminar").json()
    assert fin["cofre"]["tipo"] == "legendario"
    assert fin["final"]["aprobado"] is True and fin["perfecto"] is False
    # 8 aciertos ×10 + nivel 20 + jefe 100 (+ racha)
    assert fin["xp_ganada"] >= 8 * 10 + 20 + 100
    assert e.db.query(NivelCompletado).filter_by(nivel_id="FIN").count() == 1
    camino = e.client.get("/api/juego/cursos/C1/camino").json()["secciones"]
    assert camino[0]["niveles"][-2]["tipo"] == "final"
    assert camino[0]["niveles"][-1]["tipo"] == "cofre"  # el cofre legendario tras el castillo
    assert camino[1]["niveles"][0]["estado"] == "actual"  # siguiente sección desbloqueada


def test_derrota_cuando_el_aprobado_es_imposible(entorno):
    e = entorno
    _desbloquear(e)
    d = _post(e, "/niveles/FIN/iniciar").json()
    for i in range(3):
        assert _responder(e, d, i, False).json()["final"]["resultado"] == "en_curso"
    r = _responder(e, d, 3, False).json()
    assert r["final"]["resultado"] == "derrota" and r["final"]["corazones"] == 0
    assert _responder(e, d, 4, True).status_code == 409  # no se juega en vano
    fin = _post(e, f"/intentos/{d['intento_id']}/terminar").json()
    assert fin["cofre"] is None and fin["monedas"] == 0
    assert fin["final"]["aprobado"] is False
    assert e.db.query(NivelCompletado).filter_by(nivel_id="FIN").count() == 0
    estado = e.client.get("/api/juego/cursos/C1/camino").json()
    assert estado["secciones"][0]["niveles"][-1]["estado"] == "actual"


def test_sin_ayudas_ni_items(entorno):
    e = entorno
    _desbloquear(e)
    fila = e.db.get(EstadoJugador, e.u.id)
    fila.inventario = {"pocion_tiempo": 1, "lupa": 1}
    e.db.commit()
    d = _post(e, "/niveles/FIN/iniciar").json()
    pid = d["preguntas"][0]["id"]
    assert _post(e, f"/intentos/{d['intento_id']}/ayuda", {"pregunta_id": pid}).status_code == 409
    for item in ("pocion_tiempo", "lupa"):
        r = _post(e, "/items/usar",
                  {"item_id": item, "intento_id": d["intento_id"], "pregunta_id": pid})
        assert r.status_code == 409, item


def test_n_limitado_por_el_banco(entorno):
    e = entorno
    curso = e.fuente.cursos["C1"]
    e.fuente.agregar(CursoMemoria(
        CaminoCurso("C1", "Curso", "regex", curso.camino.secciones, final_n=40, final_g=100),
        e.u.id, True, curso.preguntas))
    _desbloquear(e)
    d = _post(e, "/niveles/FIN/iniciar").json()
    assert d["final"]["n"] == 13 and d["final"]["n_configurado"] == 40  # 3 + 6 + 4 sin abiertas
    assert d["final"]["requeridas"] == 13 and d["final"]["margen"] == 0
    assert _responder(e, d, 0, False).json()["final"]["resultado"] == "derrota"


def test_curso_de_ejemplo_tiene_final_jugable(client, db):
    from app.ejemplo.curso_regex import sembrar
    from app.play.fuente_cursos import FuenteCursosSQL

    u = Usuario(correo="r@x.com", hash_contrasena="x", fecha_nacimiento=date(1990, 1, 1),
                zona_horaria="UTC")
    db.add(u)
    db.commit()
    curso = sembrar(db, "r@x.com")
    camino = FuenteCursosSQL().camino(db, u.id, curso.id)
    assert camino.final_n == 8 and camino.final_g == 70
    finales = [n for s in camino.secciones for n in s.niveles if n.es_final]
    assert len(finales) == len(camino.secciones) == 2
    app.dependency_overrides[usuario_actual] = lambda: u
    nodos = client.get(f"/api/juego/cursos/{curso.id}/camino").json()["secciones"][0]["niveles"]
    assert nodos[-1]["tipo"] == "final"
