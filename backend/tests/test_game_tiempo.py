import pytest

from app.game.tiempo import (
    F_DIFF,
    T_MAX,
    TABLA_TIPOS,
    aplicar_extendido,
    percentil,
    recalibrar,
    tiempo_formula,
    tiempo_limite,
)
from app.game.tipos import TipoPregunta as T


def test_tabla_cubre_tipos_con_formula():
    assert TABLA_TIPOS[T.TRUE_FALSE] == (8, 6)
    assert TABLA_TIPOS[T.MULTIPLE_CHOICE] == (15, 8)
    assert TABLA_TIPOS[T.FILL_CODE] == (25, 12)
    assert TABLA_TIPOS[T.NUMERIC] == (25, 12)
    assert TABLA_TIPOS[T.FILL_TEXT] == (20, 10)
    assert TABLA_TIPOS[T.ORDERING] == (40, 20)
    assert TABLA_TIPOS[T.OPEN] == (120, 60)


def test_formula_mc_dificultad_media():
    enunciado = " ".join(["palabra"] * 33)  # 33 / 3.3 = 10 s
    assert tiempo_formula(T.MULTIPLE_CHOICE, 3, enunciado) == pytest.approx(15 * 1.25 + 10 + 1.5)


@pytest.mark.parametrize("dif", [1, 2, 3, 4, 5])
def test_formula_crece_con_dificultad(dif):
    base = tiempo_formula(T.FILL_CODE, dif, "a b c")
    assert base == pytest.approx(25 * F_DIFF[dif] + 3 / 3.3 + 1.5)


def test_formula_respeta_minimo():
    # VF fácil sin texto: 8×0.8 + 1.5 = 7.9, por encima del mínimo de 6 s
    assert tiempo_formula(T.TRUE_FALSE, 1, "") == pytest.approx(7.9)
    assert tiempo_formula(T.TRUE_FALSE, 1, "") >= TABLA_TIPOS[T.TRUE_FALSE][1]


def test_formula_tope_120():
    largo = " ".join(["x"] * 1000)
    assert tiempo_formula(T.MULTIPLE_CHOICE, 5, largo) == T_MAX
    assert tiempo_formula(T.OPEN, 5, "") == T_MAX


def test_open_usa_minimo_60():
    # 120 × 0.8 + 1.5 = 97.5
    assert tiempo_formula(T.OPEN, 1, "") == pytest.approx(97.5)


def test_dificultad_fuera_de_rango_se_acota():
    assert tiempo_formula(T.MULTIPLE_CHOICE, 0, "") == tiempo_formula(T.MULTIPLE_CHOICE, 1, "")
    assert tiempo_formula(T.MULTIPLE_CHOICE, 9, "") == tiempo_formula(T.MULTIPLE_CHOICE, 5, "")


def test_formula_falla_en_math_y_proof():
    with pytest.raises(ValueError):
        tiempo_formula(T.MATH_PROBLEM, 3, "")


@pytest.mark.parametrize("tipo", [T.MATH_PROBLEM, T.PROOF, "math_problem", "proof"])
def test_math_y_proof_15_minutos(tipo):
    assert tiempo_limite(tipo, 3, "lo que sea") == 900


def test_math_no_usa_extendido():
    assert tiempo_limite(T.MATH_PROBLEM, extendido=True) == 900


def test_tiempo_limite_redondea_hacia_arriba():
    assert tiempo_limite(T.TRUE_FALSE, 1, "") == 8  # 7.9 → 8


def test_override_por_tipo():
    cfg = {"multiple_choice": 45, "proof": 1800}
    assert tiempo_limite(T.MULTIPLE_CHOICE, 3, "x", tiempos_por_tipo=cfg) == 45
    assert tiempo_limite(T.PROOF, tiempos_por_tipo=cfg) == 1800
    # Tipos sin override siguen con su regla
    assert tiempo_limite(T.MATH_PROBLEM, tiempos_por_tipo=cfg) == 900


def test_override_invalido():
    with pytest.raises(ValueError):
        tiempo_limite(T.MULTIPLE_CHOICE, tiempos_por_tipo={"multiple_choice": 0})


def test_extendido_por_1_5_con_tope_180():
    assert aplicar_extendido(20) == 30
    assert aplicar_extendido(120) == 180
    assert aplicar_extendido(200) == 200  # nunca reduce
    normal = tiempo_limite(T.MULTIPLE_CHOICE, 3, "")
    ext = tiempo_limite(T.MULTIPLE_CHOICE, 3, "", extendido=True)
    assert ext == pytest.approx(normal * 1.5, abs=1)
    assert tiempo_limite(T.OPEN, 5, "", extendido=True) == 180


def test_extendido_aplica_a_override_de_tipo_corto():
    assert tiempo_limite(T.TRUE_FALSE, tiempos_por_tipo={"true_false": 20}, extendido=True) == 30


def test_percentil_interpolado():
    assert percentil([1, 2, 3, 4, 5], 80) == pytest.approx(4.2)
    assert percentil([7], 80) == 7
    with pytest.raises(ValueError):
        percentil([], 80)


def test_recalibra_solo_con_50_correctas():
    assert recalibrar(30, [10] * 49) == 30
    assert recalibrar(30, [10] * 50) == pytest.approx(0.5 * 30 + 0.5 * 10 * 1.15)


def test_tiempo_limite_con_recalibracion():
    t_f = tiempo_formula(T.MULTIPLE_CHOICE, 3, "")
    esperado = 0.5 * t_f + 0.5 * 20 * 1.15
    obtenido = tiempo_limite(T.MULTIPLE_CHOICE, 3, "", tiempos_correctas_s=[20.0] * 60)
    assert obtenido == pytest.approx(esperado, abs=1)
