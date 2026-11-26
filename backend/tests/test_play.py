"""Tests de API del juego: usuario con override, FuenteCursos en memoria, reloj y rng fijos."""

import random
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException, Request

from app.auth.deps import usuario_actual
from app.game.tipos import Pregunta, TipoPregunta
from app.keys import service as keys
from app.main import app
from app.models.juego import EstadoJugador
from app.models.usuarios import Usuario
from app.play import deps
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
TIEMPO_S = 30
T = TipoPregunta


def _preguntas(nivel: str) -> list[PreguntaFuente]:
    """10 preguntas: 0 MC, 1 VF, 2 numérica, 3 abierta (con pista), 4 fill, 5-9 MC."""
    ps = [
        Pregunta(f"{nivel}-0", T.MULTIPLE_CHOICE, "¿2+1?", 2, ("1", "2", "3", "4")),
        Pregunta(f"{nivel}-1", T.TRUE_FALSE, "¿El cielo es azul?", True, ("V", "F")),
        Pregunta(f"{nivel}-2", T.NUMERIC, "¿pi?", 3.14, tolerancia=0.01),
        Pregunta(f"{nivel}-3", T.OPEN, "Explica X", "Porque Y", pista="Piensa en Y"),
        Pregunta(f"{nivel}-4", T.FILL_TEXT, "Capital de Francia", ("París",)),
    ] + [
        Pregunta(f"{nivel}-{i}", T.MULTIPLE_CHOICE, f"P{i}", 1, ("a", "b", "c")) for i in range(5, 10)
    ]
    return [PreguntaFuente(p, f"Explicación {p.id}", TIEMPO_S) for p in ps]


CORRECTAS = {
    0: 2, 1: True, 2: 3.14, 3: True, 4: "parís", **{i: 1 for i in range(5, 10)},
}
INCORRECTAS = {0: 0, 1: False, 2: 99, 3: False, 4: "Roma", **{i: 0 for i in range(5, 10)}}

LECCIONES = [f"L{i}" for i in range(1, 7)]


def _curso(curso_id: str, usuario_id: str, *, publicado: bool = True) -> CursoMemoria:
    s1 = SeccionInfo(
        "S1",
        "Básicos",
        1,
        tuple(NivelInfo(f"{curso_id}{n}", n, i) for i, n in enumerate(LECCIONES))
        + (NivelInfo(f"{curso_id}CAL", "Calentamiento", 99, es_calentamiento=True),),
    )
    s2 = SeccionInfo("S2", "Final", 2, (NivelInfo(f"{curso_id}FIN", "Final", 0, es_final=True),))
    camino = CaminoCurso(curso_id, "Curso", "python", (s1, s2))
    niveles = [n.id for _, n in camino.niveles()]
    return CursoMemoria(camino, usuario_id, publicado, {n: _preguntas(n) for n in niveles})


class Reloj:
    def __init__(self):
        self.t = T0

    def avanzar(self, **kw):
        self.t += timedelta(**kw)


@pytest.fixture
def entorno(client, db):
    u1 = Usuario(correo="a@x.com", hash_contrasena="x", fecha_nacimiento=T0.date(),
                 zona_horaria="UTC")
    u2 = Usuario(correo="b@x.com", hash_contrasena="x", fecha_nacimiento=T0.date(),
                 zona_horaria="UTC")
    db.add_all([u1, u2])
    db.commit()
    fuente = FuenteCursosMemoria([_curso("C1", u1.id), _curso("C9", u1.id, publicado=False)])
    reloj = Reloj()
    gen = GeneradorPistaFalso("Pista de la IA")

    def usuario_test(request: Request) -> Usuario:
        uid = request.headers.get("x-usuario")
        if not uid:
            raise HTTPException(401, "Sin sesión.")
        return db.get(Usuario, uid)

    app.dependency_overrides[usuario_actual] = usuario_test
    app.dependency_overrides[deps.fuente_cursos] = lambda: fuente
    app.dependency_overrides[deps.ahora] = lambda: reloj.t
    app.dependency_overrides[deps.rng] = lambda: random.Random(7)
    app.dependency_overrides[deps.generador_pista] = lambda: gen

    class E:
        pass

    e = E()
    e.client, e.db, e.reloj, e.gen, e.fuente = client, db, reloj, gen, fuente
    e.h1, e.h2 = {"x-usuario": u1.id}, {"x-usuario": u2.id}
    e.u1 = u1
    return e


def _fila(e) -> EstadoJugador:
    e.client.get("/api/juego/estado", headers=e.h1)
    return e.db.get(EstadoJugador, e.u1.id)


def _modificar(e, **campos):
    f = _fila(e)
    for k, v in campos.items():
        if k in ("vidas", "progreso"):
            setattr(f, k, {**getattr(f, k), **v})
        else:
            setattr(f, k, v)
    e.db.commit()


def _iniciar(e, nivel, h=None):
    r = e.client.post(f"/api/juego/niveles/{nivel}/iniciar", headers=h or e.h1)
    assert r.status_code == 200, r.text
    return r.json()


def _resp(e, intento, pid, valor, ms=1000, h=None):
    return e.client.post(
        f"/api/juego/intentos/{intento}/responder",
        json={"pregunta_id": pid, "respuesta": valor, "tiempo_ms": ms},
        headers=h or e.h1,
    )


def _idx(pid: str) -> int:
    return int(pid.rsplit("-", 1)[1])


def _jugar(e, nivel, *, bien=True):
    datos = _iniciar(e, nivel)
    tabla = CORRECTAS if bien else INCORRECTAS
    for p in datos["preguntas"]:
        assert _resp(e, datos["intento_id"], p["id"], tabla[_idx(p["id"])]).status_code == 200
    r = e.client.post(f"/api/juego/intentos/{datos['intento_id']}/terminar", headers=e.h1)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------- tests


def test_sin_token_401(client):
    assert client.get("/api/juego/estado").status_code == 401
    assert client.get("/api/juego/tienda").status_code == 401


def test_estado_inicial_mascota_comun(entorno):
    r = entorno.client.get("/api/juego/estado", headers=entorno.h1)
    assert r.status_code == 200
    s = r.json()
    assert s["vidas"] == 10 and s["xp_color"] == 100 and s["monedas"] == 0
    assert s["mascota"]["id"] == "mascota_mushroom-sprout"
    assert s["mascota"]["rareza"] == "comun" and s["mascota"]["viva"] is True
    assert s["paleta_activa"] in s["paletas_desbloqueadas"]
    assert s["inventario"] == [{"item_id": "mascota_mushroom-sprout", "cantidad": 1}]


def test_camino(entorno):
    r = entorno.client.get("/api/juego/cursos/C1/camino", headers=entorno.h1)
    assert r.status_code == 200
    s1, s2 = r.json()["secciones"]
    estados = {n["id"]: (n["estado"], n["tipo"]) for n in s1["niveles"]}
    assert estados["C1L1"] == ("actual", "leccion")
    assert estados["C1L2"][0] == "bloqueado"
    assert estados["C1CAL"] == ("disponible", "calentamiento")
    assert s2["niveles"][0]["estado"] == "bloqueado"
    assert _resp_status(entorno, "/api/juego/niveles/C1L3/iniciar") == 409


def _resp_status(e, ruta, h=None):
    return e.client.post(ruta, headers=h or e.h1).status_code


def test_no_publicado_404(entorno):
    assert entorno.client.get("/api/juego/cursos/C9/camino", headers=entorno.h1).status_code == 404
    assert _resp_status(entorno, "/api/juego/niveles/C9L1/iniciar") == 404
    assert entorno.client.get("/api/juego/cursos/NADA/camino", headers=entorno.h1).status_code == 404


def test_iniciar_no_filtra_respuesta(entorno):
    datos = _iniciar(entorno, "C1L1")
    assert len(datos["preguntas"]) == 10
    for p in datos["preguntas"]:
        claves = {"id", "tipo", "enunciado", "opciones", "dificultad", "tiempo_s",
                  "es_calentamiento"}
        if p["tipo"] == "open":
            claves.add("explicacion")
        assert set(p) == claves
        assert p["tiempo_s"] == TIEMPO_S and p["es_calentamiento"] is False


def test_flujo_nivel_aciertos_y_errores(entorno):
    e = entorno
    # 5/10 aciertos: con el mínimo por defecto (60 %) no pasaría; se baja a 50 %.
    assert e.client.post("/api/juego/ajustes", json={"minimo_aprobar": 50},
                         headers=e.h1).status_code == 200
    datos = _iniciar(e, "C1L1")
    it = datos["intento_id"]
    xp = 0
    for k, p in enumerate(datos["preguntas"]):
        i = _idx(p["id"])
        bien = k % 2 == 0
        r = _resp(e, it, p["id"], (CORRECTAS if bien else INCORRECTAS)[i]).json()
        assert r["correcta"] is bien
        assert r["xp_ganada"] == (10 if bien else 0)
        assert "explicacion" in r and r["mascota"]["id"] == "mascota_mushroom-sprout"
        xp += r["xp_ganada"]
    assert r["vidas"] == 5  # 5 errores
    # Responder dos veces la misma pregunta: 409.
    assert _resp(e, it, datos["preguntas"][0]["id"], 2).status_code == 409
    fin = e.client.post(f"/api/juego/intentos/{it}/terminar", headers=e.h1).json()
    assert fin["perfecto"] is False and fin["vidas"] == 6  # +1 por nivel sin timeouts
    assert 10 <= fin["monedas"] <= 30
    # 50 por aciertos + 20 nivel + 5 racha día 1.
    assert fin["xp_ganada"] == xp + 20 + 5 == 75
    s = e.client.get("/api/juego/estado", headers=e.h1).json()
    assert s["xp_total_por_tema"] == {"python": 75}
    assert s["xp_color"] == 175 and s["racha"] == 1
    assert e.client.post(f"/api/juego/intentos/{it}/terminar", headers=e.h1).status_code == 409
    camino = e.client.get("/api/juego/cursos/C1/camino", headers=e.h1).json()
    est = {n["id"]: n["estado"] for n in camino["secciones"][0]["niveles"]}
    assert est["C1L1"] == "completado" and est["C1L2"] == "actual"


def test_nivel_perfecto_y_repetido(entorno):
    fin = _jugar(entorno, "C1L1")
    assert fin["perfecto"] is True
    assert fin["xp_ganada"] == 100 + 20 + 30 + 5
    rep = _jugar(entorno, "C1L1")
    assert 5 <= rep["monedas"] <= 10 and rep["drop"] is None and rep["cofre"] is None
    assert rep["xp_ganada"] == 100  # solo aciertos (bonus de racha ya dado hoy)


def test_calentamiento_no_cuesta_vidas(entorno):
    fin = _jugar(entorno, "C1CAL", bien=False)
    assert fin["vidas"] == 10
    s = entorno.client.get("/api/juego/estado", headers=entorno.h1).json()
    assert s["vidas"] == 10


def test_muerte_y_resurreccion_por_tiempo(entorno):
    e = entorno
    datos = _iniciar(e, "C1L1")
    for p in datos["preguntas"]:
        r = _resp(e, datos["intento_id"], p["id"], INCORRECTAS[_idx(p["id"])]).json()
    assert r["vidas"] == 0
    assert r["mascota"]["viva"] is False and r["mascota"]["revive_en"]
    assert r["mascota"]["ayudas_restantes_nivel"] == 0
    e.reloj.avanzar(minutes=19)
    assert e.client.get("/api/juego/estado", headers=e.h1).json()["mascota"]["viva"] is False
    e.reloj.avanzar(minutes=1)
    s = e.client.get("/api/juego/estado", headers=e.h1).json()
    assert s["mascota"]["viva"] is True and s["vidas"] == 10


def test_muerte_y_pocion_de_resurreccion(entorno):
    e = entorno
    datos = _iniciar(e, "C1L1")
    for p in datos["preguntas"]:
        _resp(e, datos["intento_id"], p["id"], INCORRECTAS[_idx(p["id"])])
    _modificar(e, inventario={"pocion_resurreccion": 1})
    r = e.client.post("/api/juego/items/usar", json={"item_id": "pocion_resurreccion"},
                      headers=e.h1)
    assert r.status_code == 200
    s = r.json()
    assert s["mascota"]["viva"] is True and s["vidas"] == 10
    assert [i["item_id"] for i in s["inventario"]] == ["mascota_mushroom-sprout"]
    # Sin poción: 409.
    r = e.client.post("/api/juego/items/usar", json={"item_id": "pocion_resurreccion"},
                      headers=e.h1)
    assert r.status_code == 409


def test_botiquin_y_comida(entorno):
    e = entorno
    _modificar(e, inventario={"botiquin": 1, "comida_mascota": 1}, vidas={"vidas": 5})
    s = e.client.post("/api/juego/items/usar", json={"item_id": "botiquin"}, headers=e.h1).json()
    assert s["vidas"] == 8
    s = e.client.post("/api/juego/items/usar", json={"item_id": "comida"},
                      headers=e.h1).json()
    assert s["mascota"]["comida"] == 10


def _pregunta_de(datos, i):
    return next(p["id"] for p in datos["preguntas"] if _idx(p["id"]) == i)


def _ayuda(e, it, pid, h=None):
    return e.client.post(f"/api/juego/intentos/{it}/ayuda", json={"pregunta_id": pid},
                         headers=h or e.h1)


def test_ayuda_comun_mc_y_409_en_abierta(entorno):
    e = entorno
    datos = _iniciar(e, "C1L1")
    it = datos["intento_id"]
    r = _ayuda(e, it, _pregunta_de(datos, 3))
    assert r.status_code == 409 and r.json()["detail"]
    r = _ayuda(e, it, _pregunta_de(datos, 0))
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["tipo_ayuda"] == "eliminar_opcion"
    assert cuerpo["datos"]["eliminar_opcion"] in {0, 1, 3}  # nunca la correcta (2)
    # Cupo de la común: 1 por nivel.
    assert _ayuda(e, it, _pregunta_de(datos, 5)).status_code == 409
    s = e.client.get("/api/juego/estado", headers=e.h1).json()
    assert s["mascota"]["comida"] == 4 and s["mascota"]["ayudas_restantes_nivel"] == 0


def test_hambre_reduce_cupo(entorno):
    e = entorno
    _modificar(e, vidas={"comida": 0})
    s = e.client.get("/api/juego/estado", headers=e.h1).json()
    assert s["mascota"]["hambrienta"] is True and s["mascota"]["ayudas_restantes_nivel"] == 0
    datos = _iniciar(e, "C1L1")
    assert _ayuda(e, datos["intento_id"], _pregunta_de(datos, 0)).status_code == 409
    # Una rara con hambre da 1 (2 // 2).
    _modificar(e, mascotas=["mascota_seti", "mascota_musgo"])
    s = e.client.post("/api/juego/mascotas/equipar", json={"mascota_id": "mascota_mini-golem"},
                      headers=e.h1).json()
    assert s["mascota"]["rareza"] == "rara" and s["mascota"]["ayudas_restantes_nivel"] == 1
    r = _ayuda(e, datos["intento_id"], _pregunta_de(datos, 2))
    assert r.json()["tipo_ayuda"] == "intervalo"
    lo, hi = r.json()["datos"]["intervalo"]
    assert lo <= 3.14 <= hi
    # Mascota no poseída: 409.
    r = e.client.post("/api/juego/mascotas/equipar", json={"mascota_id": "mascota_onyx-dragon"},
                      headers=e.h1)
    assert r.status_code == 409


def test_legendaria_pista_ia_con_y_sin_key(entorno, monkeypatch):
    e = entorno
    _modificar(e, mascotas=["mascota_seti", "mascota_nox"])
    e.client.post("/api/juego/mascotas/equipar", json={"mascota_id": "mascota_onyx-dragon"},
                  headers=e.h1)
    datos = _iniciar(e, "C1L1")
    r = _ayuda(e, datos["intento_id"], _pregunta_de(datos, 3)).json()
    assert r == {"tipo_ayuda": "pista", "datos": {"pista": "Piensa en Y"}}
    assert e.gen.llamadas == []

    monkeypatch.setattr(keys, "obtener_key_descifrada", lambda db, uid: "sk-falsa")
    usos = []
    monkeypatch.setattr(keys, "registrar_uso", lambda db, uid, a, b, ahora=None: usos.append(a + b))
    datos = _iniciar(e, "C1L1")
    r = _ayuda(e, datos["intento_id"], _pregunta_de(datos, 3)).json()
    assert r["datos"] == {"pista": "Pista de la IA"}
    assert usos == [70] and len(e.gen.llamadas) == 1
    # Si el LLM falla, vuelve a la pista escrita.
    e.gen.falla = True
    datos = _iniciar(e, "C1L1")
    r = _ayuda(e, datos["intento_id"], _pregunta_de(datos, 3)).json()
    assert r["datos"] == {"pista": "Piensa en Y"}


def test_timeout_de_servidor(entorno):
    e = entorno
    datos = _iniciar(e, "C1L1")
    it = datos["intento_id"]
    p0, p1, p2 = (p["id"] for p in datos["preguntas"][:3])
    e.reloj.avanzar(seconds=TIEMPO_S + 1)  # dentro del margen de 2 s
    r = _resp(e, it, p0, CORRECTAS[_idx(p0)], ms=1000).json()
    assert r["correcta"] is True
    e.reloj.avanzar(seconds=TIEMPO_S + 3)  # el cliente miente con tiempo_ms
    r = _resp(e, it, p1, CORRECTAS[_idx(p1)], ms=1000).json()
    assert r["correcta"] is False and r["vidas"] == 9 and r["xp_ganada"] == 0
    # El tiempo del cliente también cuenta.
    r = _resp(e, it, p2, CORRECTAS[_idx(p2)], ms=(TIEMPO_S + 1) * 1000).json()
    assert r["correcta"] is False
    fin = e.client.post(f"/api/juego/intentos/{it}/terminar", headers=e.h1).json()
    # Las 7 sin responder cuentan como timeout: 9 − 1 − 7 = 1, sin +1 por timeouts.
    assert fin["vidas"] == 1 and fin["perfecto"] is False


def test_pocion_de_tiempo_y_lupa(entorno):
    e = entorno
    _modificar(e, inventario={"pocion_tiempo": 1, "lupa": 2})
    datos = _iniciar(e, "C1L1")
    it = datos["intento_id"]
    r = e.client.post("/api/juego/items/usar",
                      json={"item_id": "pocion_tiempo", "intento_id": it}, headers=e.h1)
    assert r.json()["efecto"] == {"segundos_extra": 10}
    e.reloj.avanzar(seconds=TIEMPO_S + 8)
    p = datos["preguntas"][0]["id"]
    assert _resp(e, it, p, CORRECTAS[_idx(p)], ms=(TIEMPO_S + 5) * 1000).json()["correcta"]
    r = e.client.post("/api/juego/items/usar",
                      json={"item_id": "lupa", "intento_id": it,
                            "pregunta_id": _pregunta_de(datos, 3)}, headers=e.h1)
    if _pregunta_de(datos, 3) == p:  # pragma: no cover - depende del orden barajado
        assert r.status_code == 409
    else:
        assert r.json()["efecto"] == {"pista": "Piensa en Y"}
    r = e.client.post("/api/juego/items/usar",
                      json={"item_id": "lupa", "intento_id": it,
                            "pregunta_id": _pregunta_de(datos, 0)}, headers=e.h1)
    assert r.status_code == 409


def test_cofre_cada_5_niveles_y_abrirlo(entorno):
    e = entorno
    for n in LECCIONES[:4]:
        assert _jugar(e, f"C1{n}")["cofre"] is None
    fin = _jugar(e, "C1L5")
    assert fin["cofre"]["tipo"] == "normal"
    antes = e.client.get("/api/juego/estado", headers=e.h1).json()["monedas"]
    r = e.client.post(f"/api/juego/cofres/{fin['cofre']['id']}/abrir", headers=e.h1)
    assert r.status_code == 200
    c = r.json()
    assert len(c["items"]) == 2 and 40 <= c["monedas"] <= 80
    assert c["items"][0]["rareza"] == "rara"
    assert e.client.get("/api/juego/estado", headers=e.h1).json()["monedas"] == antes + c["monedas"]
    assert _resp_status(e, f"/api/juego/cofres/{fin['cofre']['id']}/abrir") == 409
    assert _resp_status(e, f"/api/juego/cofres/{fin['cofre']['id']}/abrir", e.h2) == 404


def test_final_sin_ayudas_y_cofre_legendario(entorno):
    e = entorno
    for n in [*LECCIONES, "CAL"]:
        _jugar(e, f"C1{n}")
    datos = _iniciar(e, "C1FIN")
    assert _ayuda(e, datos["intento_id"], _pregunta_de(datos, 0)).status_code == 409
    for p in datos["preguntas"]:
        _resp(e, datos["intento_id"], p["id"], CORRECTAS[_idx(p["id"])])
    fin = e.client.post(f"/api/juego/intentos/{datos['intento_id']}/terminar",
                        headers=e.h1).json()
    assert fin["cofre"]["tipo"] == "legendario"


def test_tienda_comprar_con_y_sin_monedas(entorno):
    e = entorno
    lista = e.client.get("/api/juego/tienda", headers=e.h1).json()
    precios = {i["item_id"]: i["precio"] for i in lista}
    assert precios["escudo"] == 150 and precios["mascota_onyx-dragon"] >= 6000
    assert set(lista[0]) == {"item_id", "nombre", "rareza", "precio", "clase"}
    r = e.client.post("/api/juego/tienda/comprar", json={"item_id": "botiquin"}, headers=e.h1)
    assert r.status_code == 409 and "monedas" in r.json()["detail"]
    _modificar(e, monedas=precios["botiquin"] + 5)
    r = e.client.post("/api/juego/tienda/comprar", json={"item_id": "botiquin"}, headers=e.h1)
    assert r.json()["monedas"] == 5
    assert {"item_id": "botiquin", "cantidad": 1} in r.json()["inventario"]
    r = e.client.post("/api/juego/tienda/comprar", json={"item_id": "nada"}, headers=e.h1)
    assert r.status_code == 404
    _modificar(e, monedas=10_000)
    r = e.client.post("/api/juego/tienda/comprar", json={"item_id": "mascota_mushroom-sprout"},
                      headers=e.h1)
    assert r.status_code == 409  # ya la tiene


def test_decaimiento_sin_escudos(entorno):
    e = entorno
    assert e.client.get("/api/juego/estado", headers=e.h1).json()["xp_color"] == 100
    e.reloj.avanzar(days=2)  # cierra 1 día sin jugar
    assert e.client.get("/api/juego/estado", headers=e.h1).json()["xp_color"] == 50
    e.reloj.avanzar(days=5)
    s = e.client.get("/api/juego/estado", headers=e.h1).json()
    assert s["xp_color"] == 0 and s["racha"] == 0


def test_decaimiento_con_escudo(entorno):
    e = entorno
    _modificar(e, monedas=150)
    e.client.post("/api/juego/tienda/comprar", json={"item_id": "escudo"}, headers=e.h1)
    s = e.client.post("/api/juego/items/usar", json={"item_id": "escudo"},
                      headers=e.h1).json()
    assert s["escudos"] == 1 and s["monedas"] == 0
    e.reloj.avanzar(days=3)  # cierra 2 días: 1 cubierto por el escudo, otro −50
    s = e.client.get("/api/juego/estado", headers=e.h1).json()
    assert s["escudos"] == 0 and s["xp_color"] == 50


def test_aislamiento_entre_usuarios(entorno):
    e = entorno
    datos = _iniciar(e, "C1L1")
    assert e.client.get("/api/juego/cursos/C1/camino", headers=e.h2).status_code == 404
    assert _resp_status(e, "/api/juego/niveles/C1L1/iniciar", e.h2) == 404
    p = datos["preguntas"][0]["id"]
    assert _resp(e, datos["intento_id"], p, 2, h=e.h2).status_code == 404
    assert _ayuda(e, datos["intento_id"], p, h=e.h2).status_code == 404
    _resp(e, datos["intento_id"], p, INCORRECTAS[_idx(p)])
    s2 = e.client.get("/api/juego/estado", headers=e.h2).json()
    assert s2["vidas"] == 10 and s2["mascota"]["id"] == "mascota_mushroom-sprout"


def test_repaso_leitner_mete_vencidas(entorno):
    e = entorno
    _modificar(e, extras={"minimo_aprobar": 0})  # completar L1 aunque falle todo
    _jugar(e, "C1L1", bien=False)
    e.reloj.avanzar(days=2)  # caja 1 → vence a 1 día
    datos = _iniciar(e, "C1L2")
    ids = [p["id"] for p in datos["preguntas"]]
    assert len(ids) == 10
    assert sum(i.startswith("C1L1-") for i in ids) == 2  # máximo 20 % de repaso


def test_respuesta_null_es_timeout(entorno):
    e = entorno
    datos = _iniciar(e, "C1L1")
    p = datos["preguntas"][0]["id"]
    r = _resp(e, datos["intento_id"], p, None).json()
    assert r["correcta"] is False and r["vidas"] == 9


def test_elegir_paleta(entorno):
    e = entorno
    s = e.client.get("/api/juego/estado", headers=e.h1).json()
    libre = s["paletas_desbloqueadas"][0]
    r = e.client.post("/api/juego/paleta", json={"paleta_id": libre}, headers=e.h1)
    assert r.status_code == 200 and r.json()["paleta_activa"] == libre
    r = e.client.post("/api/juego/paleta", json={"paleta_id": "no-existe"}, headers=e.h1)
    assert r.status_code == 409


def test_cofre_aparece_en_camino(entorno):
    e = entorno
    for n in LECCIONES[:5]:
        fin = _jugar(e, f"C1{n}")
    camino = e.client.get("/api/juego/cursos/C1/camino", headers=e.h1).json()
    nodos = camino["secciones"][0]["niveles"]
    i = [n["id"] for n in nodos].index("C1L5")
    assert nodos[i + 1] == {"id": fin["cofre"]["id"], "titulo": "Cofre",
                            "estado": "disponible", "tipo": "cofre"}
    e.client.post(f"/api/juego/cofres/{fin['cofre']['id']}/abrir", headers=e.h1)
    camino = e.client.get("/api/juego/cursos/C1/camino", headers=e.h1).json()
    assert camino["secciones"][0]["niveles"][i + 1]["estado"] == "completado"


def test_ayuda_fill_y_ordenar_formato():
    from app.play.servicio import _datos_ayuda

    assert _datos_ayuda({"tipo": "revelar_parte", "prefijo": "Pa", "longitud": 5}) == (
        "revelar", {"revelar": "Pa"})
    assert _datos_ayuda({"tipo": "fijar_paso", "posicion": 1, "elemento": 3}) == (
        "fijar_paso", {"fijar_paso": {"posicion": 1, "indice": 3}})


def test_partida_con_mascotas_del_catalogo_anterior_se_traduce(entorno):
    """Partidas guardadas antes del cambio de especies siguen jugables con las mascotas nuevas."""
    e = entorno
    e.client.get("/api/juego/estado", headers=e.h1)
    _modificar(
        e,
        mascotas=["mascota_chispa", "mascota_onix", "mascota_seti"],
        vidas={"mascota": {"id": "mascota_onix", "especie": "black-knight", "rareza": "legendaria"}},
    )
    s = e.client.get("/api/juego/estado", headers=e.h1).json()
    assert s["mascota"]["id"] == "mascota_onyx-dragon"
    assert s["mascota"]["especie"] == "onyx-dragon"
    ids_mascotas = [i["item_id"] for i in s["inventario"] if i["item_id"].startswith("mascota_")]
    assert ids_mascotas == ["mascota_mushroom-sprout", "mascota_onyx-dragon"]
    assert _fila(e).mascotas == ["mascota_seti", "mascota_nox"]
