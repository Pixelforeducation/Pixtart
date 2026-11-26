import random
from datetime import UTC, datetime, timedelta

import pytest

from app.game import seleccion as s

T0 = datetime(2026, 11, 24, tzinfo=UTC)


def test_sin_repetidos_y_tamano():
    ids = [f"q{i}" for i in range(20)]
    elegidas = s.elegir_preguntas(ids, 8, random.Random(1))
    assert len(elegidas) == 8 == len(set(elegidas))
    assert set(elegidas) <= set(ids)


def test_evita_vistas_recientes():
    ids = [f"q{i}" for i in range(10)]
    vistas = {f"q{i}": T0 for i in range(5)}
    for seed in range(20):
        elegidas = s.elegir_preguntas(ids, 5, random.Random(seed), vistas=vistas)
        assert set(elegidas) == {f"q{i}" for i in range(5, 10)}


def test_relaja_con_las_vistas_hace_mas_tiempo():
    ids = ["a", "b", "c", "d"]
    vistas = {"a": T0, "b": T0 - timedelta(days=3), "c": T0 - timedelta(days=1)}
    elegidas = s.elegir_preguntas(ids, 3, random.Random(0), vistas=vistas)
    assert set(elegidas) == {"d", "b", "c"}


def test_pide_mas_de_las_que_hay():
    assert sorted(s.elegir_preguntas(["a", "b"], 5, random.Random(0))) == ["a", "b"]
    assert s.elegir_preguntas(["a"], 0, random.Random(0)) == []


def test_candidatas_duplicadas():
    assert sorted(s.elegir_preguntas(["a", "a", "b"], 3, random.Random(0))) == ["a", "b"]


def test_vencidas_con_tope_20_por_ciento():
    ids = [f"q{i}" for i in range(30)]
    vencidas = ["q0", "q1", "q2", "q3"]
    vistas = {v: T0 for v in vencidas}
    elegidas = s.elegir_preguntas(ids, 10, random.Random(0), vistas=vistas, vencidas=vencidas)
    assert len(elegidas) == 10
    assert set(elegidas) & set(vencidas) == {"q0", "q1"}  # floor(10 × 0.2) = 2, por prioridad


def test_vencidas_fuera_de_candidatas_se_ignoran():
    elegidas = s.elegir_preguntas(["a", "b"], 2, random.Random(0), vencidas=["zz"], fraccion_repaso=1)
    assert sorted(elegidas) == ["a", "b"]


def test_determinista_y_variado():
    ids = list(range(50))
    assert s.elegir_preguntas(ids, 10, random.Random(5)) == s.elegir_preguntas(
        ids, 10, random.Random(5)
    )
    assert s.elegir_preguntas(ids, 10, random.Random(5)) != s.elegir_preguntas(
        ids, 10, random.Random(6)
    )


# ------------------------------------------------------------ Leitner


def test_leitner_cumple_interfaz():
    motor: s.MotorRepaso = s.motor_para("leitner")
    assert isinstance(motor, s.Leitner) and motor.nombre == "leitner"


def test_fsrs_pendiente_y_desconocido():
    with pytest.raises(NotImplementedError):
        s.motor_para("fsrs")
    with pytest.raises(ValueError):
        s.motor_para("sm2")


def test_tarjeta_nueva_vencida():
    m = s.Leitner()
    t = m.nueva(T0)
    assert t.caja == 1 and m.vencida(t, T0)


@pytest.mark.parametrize("aciertos,caja,dias", [(1, 2, 3), (2, 3, 7), (3, 4, 16), (4, 5, 35),
                                                 (6, 5, 35)])
def test_leitner_sube_de_caja(aciertos, caja, dias):
    m = s.Leitner()
    t = m.nueva(T0)
    for _ in range(aciertos):
        t = m.registrar(t, True, T0)
    assert t.caja == caja
    assert t.vence == T0 + timedelta(days=dias)
    assert t.repeticiones == aciertos


def test_leitner_fallo_vuelve_a_caja_1():
    m = s.Leitner()
    t = m.nueva(T0)
    for _ in range(3):
        t = m.registrar(t, True, T0)
    t = m.registrar(t, False, T0)
    assert t.caja == 1 and t.vence == T0 + timedelta(days=1)


def test_vencidas_ordenadas():
    m = s.Leitner()
    tarjetas = {
        "a": s.EstadoTarjeta(vence=T0 - timedelta(days=1)),
        "b": s.EstadoTarjeta(vence=T0 - timedelta(days=5)),
        "c": s.EstadoTarjeta(vence=T0 + timedelta(days=1)),
    }
    assert s.vencidas_ordenadas(tarjetas, m, T0) == ["b", "a"]


# ---------------------------------------------------------------- reintento (mejora 6)


def test_reintento_prefiere_propias_no_falladas():
    propias = [f"p{i}" for i in range(10)]
    fallidas = propias[:5]
    elegidas = s.elegir_reintento(propias, ["a1", "a2"], fallidas, 5, random.Random(1))
    assert sorted(elegidas) == sorted(propias[5:])


def test_reintento_completa_con_alternas_nunca_vistas_primero():
    propias = ["p0", "p1", "p2", "p3"]
    fallidas = ["p0", "p1", "p2"]
    alternas = ["a0", "a1", "a2"]
    vistas = {"a0": T0, "a1": T0 - timedelta(days=3)}
    elegidas = s.elegir_reintento(propias, alternas, fallidas, 3, random.Random(2), vistas=vistas)
    assert set(elegidas) == {"p3", "a2", "a1"}  # a2 nunca vista, luego a1 (la más vieja)


def test_reintento_repite_falladas_solo_como_ultimo_recurso():
    propias = ["p0", "p1", "p2"]
    elegidas = s.elegir_reintento(propias, ["a0"], ["p0", "p1"], 4, random.Random(3))
    assert len(elegidas) == 4 == len(set(elegidas))
    assert {"p2", "a0"} <= set(elegidas)
    assert len(set(elegidas) & {"p0", "p1"}) == 2
    # No inventa: si no hay más, devuelve menos de n
    assert len(s.elegir_reintento(propias, [], ["p0"], 10, random.Random(3))) == 3


def test_reintento_alternas_no_duplican_propias_ni_falladas():
    elegidas = s.elegir_reintento(["p0", "x"], ["x", "p0", "a0"], ["p0"], 3, random.Random(4))
    assert sorted(elegidas) == ["a0", "p0", "x"]


def test_reintento_determinista_y_n_cero():
    args = ([f"p{i}" for i in range(8)], ["a0", "a1"], ["p0", "p1"], 5)
    assert s.elegir_reintento(*args, random.Random(7)) == s.elegir_reintento(
        *args, random.Random(7)
    )
    assert s.elegir_reintento(*args[:3], 0, random.Random(7)) == []
