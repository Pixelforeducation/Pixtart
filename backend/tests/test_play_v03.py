"""Juego v0.3: equipo, ajustes, pausa/reanudar, mínimo para aprobar, reintento, cofres sin
repetidos, evolución de mascotas y nivel final en cursos viejos."""

from datetime import UTC, datetime

from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.auth.deps import usuario_actual
from app.core.crear_tablas import crear_tablas
from app.game import recompensas as rc
from app.main import app
from app.models.cursos import Curso, Nivel, Pregunta, Seccion
from app.models.juego import CofrePendiente, IntentoNivel
from app.models.usuarios import Usuario
from app.pipeline.servicio import asegurar_niveles_finales_todos
from app.play import deps
from tests import test_play
from tests.test_play import (
    CORRECTAS,
    INCORRECTAS,
    LECCIONES,
    TIEMPO_S,
    _ayuda,
    _idx,
    _iniciar,
    _jugar,
    _modificar,
    _pregunta_de,
    _resp,
)

entorno = test_play.entorno  # fixture compartida

EQUIPABLES = [i.id for i in rc.CATALOGO if rc.ranura_de(i.id)]


def _estado(e):
    return e.client.get("/api/juego/estado", headers=e.h1).json()


def _post(e, ruta, cuerpo=None):
    return e.client.post(ruta, json=cuerpo, headers=e.h1)


def _terminar(e, it):
    r = _post(e, f"/api/juego/intentos/{it}/terminar")
    assert r.status_code == 200, r.text
    return r.json()


def _camino(e):
    c = e.client.get("/api/juego/cursos/C1/camino", headers=e.h1).json()
    return {n["id"]: n["estado"] for s in c["secciones"] for n in s["niveles"]}


# ---------------------------------------------------------------- estado, equipo y ajustes


def test_estado_v03_valores_por_defecto(entorno):
    s = _estado(entorno)
    assert s["minimo_aprobar"] == 60
    assert s["equipo"] == {"arma": None, "armadura": None, "ropa": None}
    assert s["evoluciones_mascotas"] == {
        "mascota_mushroom-sprout": {"xp": 0, "etapa": 1, "xp_siguiente": 60}
    }
    m = s["mascota"]
    assert (m["xp"], m["etapa"], m["xp_siguiente"], m["racha_sin_ayuda"]) == (0, 1, 60, 0)


def test_fila_vieja_sin_extras(entorno):
    _modificar(entorno, extras=None)
    s = _estado(entorno)
    assert s["minimo_aprobar"] == 60 and s["equipo"]["arma"] is None


def test_ajustes_minimo(entorno):
    r = _post(entorno, "/api/juego/ajustes", {"minimo_aprobar": 80})
    assert r.status_code == 200 and r.json()["minimo_aprobar"] == 80
    assert _estado(entorno)["minimo_aprobar"] == 80
    assert _post(entorno, "/api/juego/ajustes", {"minimo_aprobar": 101}).status_code == 422
    assert _post(entorno, "/api/juego/ajustes", {"minimo_aprobar": -1}).status_code == 422


def test_tienda_clase_comprar_equipar_y_quitar(entorno):
    e = entorno
    tienda = {i["item_id"]: i for i in e.client.get("/api/juego/tienda", headers=e.h1).json()}
    assert tienda["arma_espada"]["clase"] == "arma"
    assert tienda["armadura_cuero"]["clase"] == "armadura"
    assert tienda["ropa_capa_roja"]["clase"] == "ropa"
    assert tienda["botiquin"]["clase"] == "consumible"
    assert tienda["mascota_onyx-dragon"]["clase"] == "mascota"
    # Equipar sin poseer: 409.
    assert _post(e, "/api/juego/equipo", {"item_id": "arma_espada"}).status_code == 409
    _modificar(e, monedas=100_000)
    r = _post(e, "/api/juego/tienda/comprar", {"item_id": "arma_espada"})
    assert r.status_code == 200
    assert {"item_id": "arma_espada", "cantidad": 1} in r.json()["inventario"]
    # Equipable ya poseído: 409 (se posee una sola vez).
    assert _post(e, "/api/juego/tienda/comprar", {"item_id": "arma_espada"}).status_code == 409
    # No se usa como consumible.
    assert _post(e, "/api/juego/items/usar", {"item_id": "arma_espada"}).status_code == 409
    r = _post(e, "/api/juego/equipo", {"item_id": "arma_espada"})
    assert r.status_code == 200 and r.json()["equipo"]["arma"] == "arma_espada"
    # Un consumible o un id desconocido no se equipan.
    _post(e, "/api/juego/tienda/comprar", {"item_id": "botiquin"})
    assert _post(e, "/api/juego/equipo", {"item_id": "botiquin"}).status_code == 409
    assert _post(e, "/api/juego/equipo", {"item_id": "nada"}).status_code == 409
    r = _post(e, "/api/juego/equipo/quitar", {"ranura": "arma"})
    assert r.status_code == 200 and r.json()["equipo"]["arma"] is None
    assert _post(e, "/api/juego/equipo/quitar", {"ranura": "casco"}).status_code == 422


# ---------------------------------------------------------------- pausa y reanudar


def test_pausar_y_reanudar_mismo_nivel(entorno):
    e = entorno
    datos = _iniciar(e, "C1L1")
    it = datos["intento_id"]
    p0, p1 = (p["id"] for p in datos["preguntas"][:2])
    assert _resp(e, it, p0, CORRECTAS[_idx(p0)]).json()["correcta"] is True
    e.reloj.avanzar(seconds=10)
    r = _post(e, f"/api/juego/intentos/{it}/pausar")
    assert r.status_code == 204 and r.content == b""
    assert _post(e, f"/api/juego/intentos/{it}/pausar").status_code == 204  # idempotente
    e.reloj.avanzar(hours=1)
    otra = _iniciar(e, "C1L1")
    assert otra["intento_id"] == it and otra["reanudado"] is True
    assert [p["id"] for p in otra["preguntas"]] == [p["id"] for p in datos["preguntas"]]
    prog = otra["progreso"]
    assert prog["respondidas"] == [{"pregunta_id": p0, "correcta": True, "xp_ganada": 10}]
    assert prog["restante_s"] == TIEMPO_S - 10 and prog["xp_ganada"] == 10
    # Reloj descongelado: le quedan 20 s.
    e.reloj.avanzar(seconds=15)
    assert _resp(e, it, p1, CORRECTAS[_idx(p1)]).json()["correcta"] is True


def test_responder_pausada_sin_reanudar_no_da_timeout(entorno):
    e = entorno
    datos = _iniciar(e, "C1L1")
    it = datos["intento_id"]
    p0 = datos["preguntas"][0]["id"]
    e.reloj.avanzar(seconds=5)
    _post(e, f"/api/juego/intentos/{it}/pausar")
    e.reloj.avanzar(hours=2)
    r = _resp(e, it, p0, CORRECTAS[_idx(p0)]).json()
    assert r["correcta"] is True
    # Sin pausa el reloj sí corre.
    p1 = datos["preguntas"][1]["id"]
    e.reloj.avanzar(seconds=TIEMPO_S + 5)
    assert _resp(e, it, p1, CORRECTAS[_idx(p1)]).json()["correcta"] is False


def test_iniciar_otro_nivel_abandona_el_pausado(entorno):
    e = entorno
    datos = _iniciar(e, "C1L1")
    _post(e, f"/api/juego/intentos/{datos['intento_id']}/pausar")
    otro = _iniciar(e, "C1CAL")
    assert "reanudado" not in otro
    assert e.db.get(IntentoNivel, datos["intento_id"]).estado == "abandonado"
    nuevo = _iniciar(e, "C1L1")
    assert nuevo["intento_id"] != datos["intento_id"] and "reanudado" not in nuevo


# ---------------------------------------------------------------- mínimo y reintento


def test_no_aprobado_no_completa_ni_da_cofre(entorno):
    e = entorno
    _modificar(e, vidas={"vidas": 9})
    datos = _iniciar(e, "C1L1")
    it = datos["intento_id"]
    servidas = {p["id"] for p in datos["preguntas"]}
    for k, p in enumerate(datos["preguntas"]):  # 5/10 = 50 % < 60 %
        tabla = CORRECTAS if k < 5 else INCORRECTAS
        _resp(e, it, p["id"], tabla[_idx(p["id"])])
    fin = _terminar(e, it)
    assert (fin["aprobado"], fin["porcentaje"], fin["minimo"]) == (False, 50, 60)
    assert fin["cofre"] is None and fin["drop"] is None
    assert 5 <= fin["monedas"] <= 10
    assert fin["xp_ganada"] == 50  # solo las respuestas
    assert fin["vidas"] == 4  # 9 − 5, sin +1 por nivel
    assert _camino(e)["C1L1"] == "actual" and _camino(e)["C1L2"] == "bloqueado"
    # Reintento: preguntas distintas de la misma dificultad (de otros niveles de la sección).
    rei = _iniciar(e, "C1L1")
    assert rei["reintento"] is True and len(rei["preguntas"]) == 10
    assert not servidas & {p["id"] for p in rei["preguntas"]}
    for p in rei["preguntas"]:
        _resp(e, rei["intento_id"], p["id"], CORRECTAS[_idx(p["id"])])
    fin = _terminar(e, rei["intento_id"])
    assert fin["aprobado"] is True and fin["porcentaje"] == 100
    assert _camino(e)["C1L1"] == "completado" and _camino(e)["C1L2"] == "actual"


def test_aprobado_en_el_limite(entorno):
    e = entorno
    datos = _iniciar(e, "C1L1")
    for k, p in enumerate(datos["preguntas"]):  # 6/10 = 60 %
        tabla = CORRECTAS if k < 6 else INCORRECTAS
        _resp(e, datos["intento_id"], p["id"], tabla[_idx(p["id"])])
    fin = _terminar(e, datos["intento_id"])
    assert fin["aprobado"] is True and fin["porcentaje"] == 60
    assert "reintento" not in _iniciar(e, "C1L2")


def test_minimo_cero_siempre_aprueba(entorno):
    _post(entorno, "/api/juego/ajustes", {"minimo_aprobar": 0})
    fin = _jugar(entorno, "C1L1", bien=False)
    assert fin["aprobado"] is True and fin["porcentaje"] == 0


def test_calentamiento_no_exige_minimo(entorno):
    fin = _jugar(entorno, "C1CAL", bien=False)
    assert fin["aprobado"] is True and fin["porcentaje"] == 0 and fin["minimo"] == 0
    assert _camino(entorno)["C1CAL"] == "completado"
    assert "reintento" not in _iniciar(entorno, "C1CAL")


def test_no_aprobado_no_avanza_contador_de_cofres(entorno):
    e = entorno
    for _ in range(5):
        assert _jugar(e, "C1L1", bien=False)["cofre"] is None
    for n in LECCIONES[:4]:
        assert _jugar(e, f"C1{n}")["cofre"] is None
    assert _jugar(e, "C1L5")["cofre"]["tipo"] == "normal"


# ---------------------------------------------------------------- cofres sin repetidos


def test_cofre_no_repite_unicos_poseidos(entorno):
    e = entorno
    unicos = [i.id for i in rc.CATALOGO if rc.es_unico(i.id)]
    mascotas = [i for i in unicos if rc.ITEMS[i].clase is rc.ClaseItem.MASCOTA]
    _modificar(e, mascotas=mascotas, inventario={i: 1 for i in unicos if i not in mascotas})
    for tipo in ("normal", "legendario"):
        c = CofrePendiente(usuario_id=e.u1.id, tipo=tipo, curso_id="C1", nivel_id="C1L1")
        e.db.add(c)
        e.db.commit()
        r = _post(e, f"/api/juego/cofres/{c.id}/abrir").json()
        assert all(not rc.es_unico(rc.ITEMS[_interno(i["item_id"])].id) for i in r["items"])
        assert len({i["item_id"] for i in r["items"]}) == len(r["items"])
    inv = {i["item_id"]: i["cantidad"] for i in _estado(e)["inventario"]}
    assert all(inv[i] == 1 for i in EQUIPABLES)


def _interno(publico: str) -> str:
    from app.play import ids

    return ids.interno(publico)


# ---------------------------------------------------------------- evolución de mascota


def test_xp_mascota_racha_sin_ayuda_y_bonus(entorno):
    e = entorno
    datos = _iniciar(e, "C1L1")
    eventos = []
    for p in datos["preguntas"]:
        r = _resp(e, datos["intento_id"], p["id"], CORRECTAS[_idx(p["id"])]).json()
        eventos.append(r["mascota_evento"]["xp_ganada"])
    assert eventos == [2, 2, 3, 3, 3, 4, 4, 4, 5, 5]
    assert r["mascota"]["racha_sin_ayuda"] == 10 and r["mascota"]["xp"] == 35
    fin = _terminar(e, datos["intento_id"])
    assert fin["mascota_evento"] == {"xp_ganada": 10, "evoluciono": False, "etapa": 1}
    s = _estado(e)
    assert s["mascota"]["xp"] == 45
    assert s["evoluciones_mascotas"]["mascota_mushroom-sprout"]["xp"] == 45


def test_ayuda_corta_racha_y_reduce_bonus(entorno):
    e = entorno
    datos = _iniciar(e, "C1L1")
    it = datos["intento_id"]
    p0 = _pregunta_de(datos, 0)
    assert _ayuda(e, it, p0).status_code == 200
    r = _resp(e, it, p0, CORRECTAS[0]).json()
    assert r["mascota_evento"] == {"xp_ganada": 0, "evoluciono": False, "etapa": 1}
    assert r["mascota"]["racha_sin_ayuda"] == 0
    for p in datos["preguntas"]:
        if p["id"] != p0:
            _resp(e, it, p["id"], CORRECTAS[_idx(p["id"])])
    assert _terminar(e, it)["mascota_evento"]["xp_ganada"] == 4  # con ayuda, sin perder vidas


def test_fallo_sin_xp_y_sin_bonus(entorno):
    e = entorno
    _post(e, "/api/juego/ajustes", {"minimo_aprobar": 0})
    datos = _iniciar(e, "C1L1")
    _ayuda(e, datos["intento_id"], _pregunta_de(datos, 0))
    for p in datos["preguntas"]:
        r = _resp(e, datos["intento_id"], p["id"], INCORRECTAS[_idx(p["id"])]).json()
        if r["mascota_evento"] is not None:
            assert r["mascota_evento"]["xp_ganada"] == 0
    assert _terminar(e, datos["intento_id"])["mascota_evento"] is None


def test_evoluciona_y_etapa_3_da_ayuda_extra(entorno):
    e = entorno
    _modificar(e, extras={"evoluciones": {"mascota_seti": {"xp": 58, "racha_sin_ayuda": 0}}})
    datos = _iniciar(e, "C1L1")
    p = datos["preguntas"][0]["id"]
    r = _resp(e, datos["intento_id"], p, CORRECTAS[_idx(p)]).json()
    assert r["mascota_evento"] == {"xp_ganada": 2, "evoluciono": True, "etapa": 2}
    assert r["mascota"]["etapa"] == 2 and r["mascota"]["xp_siguiente"] == 200
    _modificar(e, extras={"evoluciones": {"mascota_seti": {"xp": 200, "racha_sin_ayuda": 0}}})
    s = _estado(e)
    assert s["mascota"]["etapa"] == 3 and s["mascota"]["xp_siguiente"] is None
    assert s["mascota"]["ayudas_restantes_nivel"] == 2  # común 1 + 1 de la forma final
    datos = _iniciar(e, "C1CAL")  # otro nivel: cupo nuevo
    it = datos["intento_id"]
    assert _ayuda(e, it, _pregunta_de(datos, 0)).status_code == 200
    assert _ayuda(e, it, _pregunta_de(datos, 5)).status_code == 200
    assert _ayuda(e, it, _pregunta_de(datos, 6)).status_code == 409


def test_nivel_final_sin_xp_de_mascota(entorno):
    e = entorno
    for n in [*LECCIONES, "CAL"]:
        _jugar(e, f"C1{n}")
    xp_antes = _estado(e)["mascota"]["xp"]
    datos = _iniciar(e, "C1FIN")
    for p in datos["preguntas"]:
        r = _resp(e, datos["intento_id"], p["id"], CORRECTAS[_idx(p["id"])]).json()
        assert r["mascota_evento"] is None
    _terminar(e, datos["intento_id"])
    assert _estado(e)["mascota"]["xp"] == xp_antes


# ---------------------------------------------------------------- nivel final en cursos viejos

T0 = datetime(2026, 11, 24, 15, 0, tzinfo=UTC)


def test_asegurar_nivel_final_idempotente_y_jugable(client, db):
    u = Usuario(correo="v@x.com", hash_contrasena="x", fecha_nacimiento=T0.date())
    db.add(u)
    db.flush()
    c = Curso(usuario_id=u.id, titulo="Viejo", tema="viejo", estado="publicado", config={})
    db.add(c)
    db.flush()
    s = Seccion(curso_id=c.id, titulo="Única", orden=0)
    vacia = Seccion(curso_id=c.id, titulo="Vacía", orden=1)
    db.add_all([s, vacia])
    db.flush()
    n = Nivel(seccion_id=s.id, titulo="N1", orden=0)
    db.add(n)
    db.flush()
    db.add_all([
        Pregunta(nivel_id=n.id, orden=i, tipo="multiple_choice", enunciado=f"¿{i}?",
                 opciones=["a", "b"], respuesta=0, tiempo_s=20, valida=True)
        for i in range(4)
    ])
    db.commit()
    assert asegurar_niveles_finales_todos(db) == 1
    assert asegurar_niveles_finales_todos(db) == 0
    fin = next(x for x in db.query(Nivel).filter(Nivel.seccion_id == s.id) if x.es_final)
    assert fin.titulo == "Nivel final: Única" and fin.orden == 1

    def usuario_test(request: Request) -> Usuario:
        return db.get(Usuario, request.headers["x-usuario"])

    app.dependency_overrides[usuario_actual] = usuario_test
    app.dependency_overrides[deps.ahora] = lambda: T0
    h = {"x-usuario": u.id}
    camino = client.get(f"/api/juego/cursos/{c.id}/camino", headers=h).json()
    nodos = camino["secciones"][0]["niveles"]
    assert [x["tipo"] for x in nodos] == ["leccion", "final"]
    ini = client.post(f"/api/juego/niveles/{n.id}/iniciar", headers=h).json()
    for p in ini["preguntas"]:
        client.post(f"/api/juego/intentos/{ini['intento_id']}/responder",
                    json={"pregunta_id": p["id"], "respuesta": 0, "tiempo_ms": 500}, headers=h)
    client.post(f"/api/juego/intentos/{ini['intento_id']}/terminar", headers=h)
    r = client.post(f"/api/juego/niveles/{fin.id}/iniciar", headers=h)
    assert r.status_code == 200 and r.json()["final"]["requeridas"] >= 1


def test_crear_tablas_idempotente():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    assert crear_tablas(engine) == 0
    assert crear_tablas(engine) == 0


def test_retomar_sin_pausa_no_agota_la_pregunta(entorno):
    """Cerrar la pestaña sin pausar: al volver la pregunta en curso tiene su tiempo completo."""
    e = entorno
    datos = _iniciar(e, "C1L1")
    e.reloj.avanzar(hours=2)
    rei = _iniciar(e, "C1L1")
    assert rei["reanudado"] is True
    assert rei["progreso"]["respondidas"] == []
    assert rei["progreso"]["restante_s"] > 0
    assert rei["intento_id"] == datos["intento_id"]
