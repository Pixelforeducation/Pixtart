import random
from datetime import UTC, datetime, timedelta

import pytest

from app.game import mascota as m
from app.game.tipos import AccionInvalida, Pregunta, Rareza, TipoPregunta

T0 = datetime(2026, 11, 24, 12, 0, tzinfo=UTC)
COMUN = m.Mascota("p1", "mushroom-sprout", Rareza.COMUN)
RARA = m.Mascota("p2", "book-golem", Rareza.RARA)
LEGENDARIA = m.Mascota("p3", "onyx-dragon", Rareza.LEGENDARIA)


def estado(mascota=COMUN, vidas=10, comida=5):
    return m.EstadoVidas(vidas=vidas, mascota=mascota, comida=comida)


def matar(e, ahora=T0):
    for _ in range(e.vidas):
        e = m.registrar_respuesta(e, False, ahora)
    return e


MC = Pregunta("q1", TipoPregunta.MULTIPLE_CHOICE, "¿?", 2, opciones=("a", "b", "c", "d"))
VF = Pregunta("q2", TipoPregunta.TRUE_FALSE, "¿?", True)
FILL = Pregunta("q3", TipoPregunta.FILL_TEXT, "¿?", ("docker", "Docker"))
NUM = Pregunta("q4", TipoPregunta.NUMERIC, "¿?", 42.0, tolerancia=0.5)
ORD = Pregunta("q5", TipoPregunta.ORDERING, "¿?", (2, 0, 1, 3))
OPEN = Pregunta("q6", TipoPregunta.OPEN, "¿?", "ref", pista="piensa en X")
MATH = Pregunta("q7", TipoPregunta.MATH_PROBLEM, "¿?", "ref")
PROOF = Pregunta("q8", TipoPregunta.PROOF, "¿?", "ref")


def test_ahora_debe_ser_aware():
    with pytest.raises(ValueError):
        m.actualizar(estado(), datetime(2026, 1, 1))


# ------------------------------------------------------------ vidas


def test_empieza_con_10_vidas():
    assert m.EstadoVidas().vidas == m.VIDAS_MAX == 10


def test_error_resta_una_vida():
    e = m.registrar_respuesta(estado(), False, T0)
    assert e.vidas == 9


def test_acierto_no_resta():
    assert m.registrar_respuesta(estado(), True, T0).vidas == 10


def test_calentamiento_no_cuesta_vidas():
    assert m.registrar_respuesta(estado(), False, T0, calentamiento=True).vidas == 10


def test_sin_mascota_fallar_no_cuesta():
    e = m.EstadoVidas(vidas=10, mascota=None)
    assert m.registrar_respuesta(e, False, T0).vidas == 10


def test_muere_a_cero_vidas_20_minutos():
    e = matar(estado())
    assert e.vidas == 0
    assert e.muerta_hasta == T0 + timedelta(minutes=20)
    assert not m.esta_viva(e, T0 + timedelta(minutes=19, seconds=59))
    vista = m.vista_mascota(e, T0)
    assert vista["viva"] is False
    assert vista["revive_en"] == (T0 + timedelta(minutes=20)).isoformat()
    assert vista["ayudas_restantes_nivel"] == 0


def test_muerta_fallar_no_cuesta_extra():
    e = matar(estado())
    e2 = m.registrar_respuesta(e, False, T0 + timedelta(minutes=5))
    assert e2 == e


def test_revive_por_tiempo_con_10_vidas():
    e = matar(estado())
    despues = T0 + timedelta(minutes=20)
    assert m.esta_viva(e, despues)
    e2 = m.actualizar(e, despues)
    assert e2.vidas == 10 and e2.muerta_hasta is None
    assert m.vista_mascota(e, despues)["viva"] is True


def test_revive_con_pocion():
    e = matar(estado())
    e2 = m.usar_pocion_resurreccion(e, T0 + timedelta(minutes=1))
    assert e2.vidas == 10 and e2.muerta_hasta is None


def test_pocion_en_mascota_viva_falla():
    with pytest.raises(AccionInvalida):
        m.usar_pocion_resurreccion(estado(), T0)


def test_botiquin_cura_3_con_tope():
    e = m.usar_botiquin(estado(vidas=5), T0)
    assert e.vidas == 8
    assert m.usar_botiquin(estado(vidas=9), T0).vidas == 10


def test_botiquin_no_resucita():
    with pytest.raises(AccionInvalida):
        m.usar_botiquin(matar(estado()), T0)


def test_botiquin_con_vidas_llenas_o_sin_mascota_falla():
    with pytest.raises(AccionInvalida):
        m.usar_botiquin(estado(), T0)
    with pytest.raises(AccionInvalida):
        m.usar_botiquin(m.EstadoVidas(vidas=3), T0)


def test_mas_una_vida_por_nivel_sin_timeouts():
    e = m.completar_nivel(estado(vidas=6), T0, sin_timeouts=True)
    assert e.vidas == 7
    assert m.completar_nivel(estado(vidas=6), T0, sin_timeouts=False).vidas == 6
    assert m.completar_nivel(estado(vidas=10), T0, sin_timeouts=True).vidas == 10


def test_recarga_total_al_completar_seccion():
    e = m.completar_nivel(estado(vidas=2), T0, sin_timeouts=False, completa_seccion=True)
    assert e.vidas == 10


def test_completar_nivel_no_resucita():
    e = matar(estado())
    e2 = m.completar_nivel(e, T0, sin_timeouts=True, completa_seccion=True)
    assert e2.vidas == 0 and e2.muerta_hasta is not None


def test_no_se_equipa_mientras_esta_muerta():
    e = matar(estado())
    with pytest.raises(AccionInvalida):
        m.equipar(e, RARA, T0)
    e2 = m.equipar(e, RARA, T0 + timedelta(minutes=21))
    assert e2.mascota == RARA and e2.vidas == 10


def test_equipar_conserva_vidas():
    e = m.equipar(estado(vidas=4), LEGENDARIA, T0)
    assert e.mascota == LEGENDARIA and e.vidas == 4


# ------------------------------------------------------------ cupo y hambre


@pytest.mark.parametrize(
    "rareza,normal,hambre",
    [(Rareza.COMUN, 1, 0), (Rareza.RARA, 2, 1), (Rareza.LEGENDARIA, 3, 1)],
)
def test_cupo_por_rareza(rareza, normal, hambre):
    assert m.cupo_ayudas(rareza, False) == normal
    assert m.cupo_ayudas(rareza, True) == hambre


def test_hambrienta_si_comida_cero():
    assert m.hambrienta(estado(comida=0))
    assert not m.hambrienta(estado(comida=1))
    assert m.vista_mascota(estado(comida=0), T0)["hambrienta"] is True


def test_vista_sin_mascota_es_none():
    assert m.vista_mascota(m.EstadoVidas(), T0) is None


def test_vista_campos_del_contrato():
    v = m.vista_mascota(estado(mascota=RARA, comida=3), T0)
    assert set(v) == {
        "id", "especie", "rareza", "viva", "revive_en", "comida", "hambrienta",
        "ayudas_restantes_nivel",
    }
    assert v["rareza"] == "rara" and v["ayudas_restantes_nivel"] == 2


def test_usar_ayuda_consume_cupo_y_comida():
    rng = random.Random(1)
    e = m.iniciar_nivel(estado(mascota=RARA, comida=5), T0)
    e, ayuda = m.usar_ayuda(e, MC, rng, T0)
    assert ayuda["tipo"] == "eliminar_opcion"
    assert e.comida == 4 and m.ayudas_restantes(e, T0) == 1
    e, _ = m.usar_ayuda(e, MC, rng, T0, ya_dadas=frozenset({ayuda["eliminar_opcion"]}))
    assert m.ayudas_restantes(e, T0) == 0
    with pytest.raises(m.SinAyuda):
        m.usar_ayuda(e, MC, rng, T0)


def test_iniciar_nivel_reinicia_cupo():
    rng = random.Random(1)
    e = m.iniciar_nivel(estado(), T0)
    e, _ = m.usar_ayuda(e, MC, rng, T0)
    assert m.ayudas_restantes(e, T0) == 0
    assert m.ayudas_restantes(m.iniciar_nivel(e, T0), T0) == 1


def test_comun_hambrienta_no_ayuda():
    e = m.iniciar_nivel(estado(comida=0), T0)
    with pytest.raises(m.SinAyuda):
        m.usar_ayuda(e, MC, random.Random(0), T0)


def test_legendaria_hambrienta_ayuda_una_vez():
    e = m.iniciar_nivel(estado(mascota=LEGENDARIA, comida=0), T0)
    assert m.ayudas_restantes(e, T0) == 1
    e, _ = m.usar_ayuda(e, OPEN, random.Random(0), T0)
    assert e.comida == 0
    assert m.ayudas_restantes(e, T0) == 0


def test_quedarse_sin_comida_a_mitad_de_nivel_baja_el_cupo():
    e = m.iniciar_nivel(estado(mascota=LEGENDARIA, comida=1), T0)
    assert m.ayudas_restantes(e, T0) == 3
    e, _ = m.usar_ayuda(e, MC, random.Random(0), T0)
    # ahora hambrienta: cupo 1, ya usó 1
    assert m.ayudas_restantes(e, T0) == 0


def test_muerta_sin_ayudas():
    e = matar(estado(mascota=LEGENDARIA))
    with pytest.raises(m.SinAyuda):
        m.usar_ayuda(e, MC, random.Random(0), T0)


def test_sin_mascota_sin_ayudas():
    with pytest.raises(m.SinAyuda):
        m.usar_ayuda(m.EstadoVidas(comida=5), MC, random.Random(0), T0)


def test_nivel_final_sin_ayudas():
    e = m.iniciar_nivel(estado(mascota=LEGENDARIA), T0, es_final=True)
    assert m.ayudas_restantes(e, T0) == 0


def test_tipo_no_cubierto_no_consume():
    e = m.iniciar_nivel(estado(), T0)
    with pytest.raises(m.SinAyuda):
        m.usar_ayuda(e, NUM, random.Random(0), T0)


def test_dar_comida():
    assert m.dar_comida(estado(comida=0), 3).comida == 3
    with pytest.raises(ValueError):
        m.dar_comida(estado(), 0)


# ------------------------------------------------------------ ayuda_para


@pytest.mark.parametrize("rareza", list(Rareza))
def test_mc_elimina_una_incorrecta(rareza):
    for seed in range(30):
        a = m.ayuda_para(MC, rareza, random.Random(seed))
        assert a["tipo"] == "eliminar_opcion"
        assert a["eliminar_opcion"] in {0, 1, 3}


def test_mc_no_repite_ni_deja_menos_de_dos():
    a = m.ayuda_para(MC, Rareza.COMUN, random.Random(0), ya_dadas=frozenset({0}))
    assert a["eliminar_opcion"] in {1, 3}
    assert m.ayuda_para(MC, Rareza.COMUN, random.Random(0), ya_dadas=frozenset({0, 1})) is None
    dos = Pregunta("x", TipoPregunta.MULTIPLE_CHOICE, "", 0, opciones=("a", "b"))
    assert m.ayuda_para(dos, Rareza.RARA, random.Random(0)) is None


@pytest.mark.parametrize("respuesta,incorrecta", [(True, 1), (False, 0)])
def test_vf_elimina_la_incorrecta(respuesta, incorrecta):
    p = Pregunta("x", TipoPregunta.TRUE_FALSE, "", respuesta)
    assert m.ayuda_para(p, Rareza.COMUN, random.Random(0))["eliminar_opcion"] == incorrecta


@pytest.mark.parametrize("p", [FILL, NUM, ORD, OPEN, MATH, PROOF])
def test_comun_solo_mc_vf(p):
    assert m.ayuda_para(p, Rareza.COMUN, random.Random(0)) is None


def test_rara_fill_revela_parte():
    a = m.ayuda_para(FILL, Rareza.RARA, random.Random(0))
    assert a == {"tipo": "revelar_parte", "prefijo": "do", "longitud": 6}
    assert "docker".startswith(a["prefijo"]) and len(a["prefijo"]) < 6


def test_fill_code_y_respuesta_corta():
    p = Pregunta("x", TipoPregunta.FILL_CODE, "", ("x",))
    assert m.ayuda_para(p, Rareza.RARA, random.Random(0))["prefijo"] == ""
    vacia = Pregunta("x", TipoPregunta.FILL_CODE, "", ())
    assert m.ayuda_para(vacia, Rareza.RARA, random.Random(0)) is None


@pytest.mark.parametrize("seed", range(50))
def test_rara_numeric_intervalo_contiene_respuesta(seed):
    a = m.ayuda_para(NUM, Rareza.RARA, random.Random(seed))
    assert a["tipo"] == "intervalo"
    assert a["min"] < 42 < a["max"]


def test_numeric_cero():
    p = Pregunta("x", TipoPregunta.NUMERIC, "", 0)
    a = m.ayuda_para(p, Rareza.LEGENDARIA, random.Random(3))
    assert a["min"] < 0 < a["max"]


def test_rara_ordering_fija_un_paso():
    a = m.ayuda_para(ORD, Rareza.RARA, random.Random(0))
    assert a["tipo"] == "fijar_paso"
    assert ORD.respuesta[a["posicion"]] == a["elemento"]
    b = m.ayuda_para(ORD, Rareza.RARA, random.Random(0), ya_dadas=frozenset({0, 1}))
    assert b["posicion"] in {2, 3}
    assert m.ayuda_para(ORD, Rareza.RARA, random.Random(0), ya_dadas=frozenset({0, 1, 2})) is None


@pytest.mark.parametrize("p", [OPEN, MATH, PROOF])
def test_rara_no_ayuda_en_abiertas(p):
    assert m.ayuda_para(p, Rareza.RARA, random.Random(0)) is None


@pytest.mark.parametrize("p", [OPEN, MATH, PROOF])
def test_legendaria_pista_ia_en_abiertas(p):
    a = m.ayuda_para(p, Rareza.LEGENDARIA, random.Random(0))
    assert a["tipo"] == "pista_ia"
    assert a["pista_escrita"] == p.pista


@pytest.mark.parametrize("p", [MC, VF, FILL, NUM, ORD])
def test_legendaria_ayuda_en_todo(p):
    assert m.ayuda_para(p, Rareza.LEGENDARIA, random.Random(0)) is not None


def test_ayuda_determinista_con_seed():
    a = m.ayuda_para(MC, Rareza.RARA, random.Random(7))
    b = m.ayuda_para(MC, Rareza.RARA, random.Random(7))
    assert a == b


def test_siempre_se_puede_jugar_muerta():
    """Muerta: responder sigue funcionando, sin costo ni excepción."""
    e = matar(estado())
    for _ in range(5):
        e = m.registrar_respuesta(e, False, T0 + timedelta(minutes=1))
        e = m.registrar_respuesta(e, True, T0 + timedelta(minutes=1))
    assert e.vidas == 0
