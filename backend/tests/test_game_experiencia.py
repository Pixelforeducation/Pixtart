from datetime import UTC, date, datetime, timedelta

import pytest

from app.game import experiencia as x
from app.game.tipos import AccionInvalida

ZONA = "America/Mexico_City"  # UTC−6 todo el año


def local(y, mo, d, h=12, mi=0):
    """Hora local de CDMX expresada en UTC."""
    return datetime(y, mo, d, h, mi, tzinfo=UTC) + timedelta(hours=6)


REGISTRO = local(2026, 11, 1)


def nuevo():
    return x.nuevo_progreso(REGISTRO, ZONA)


def jugar(e, ahora, tema="docker", **kw):
    e, _ = x.completar_nivel(e, tema, ahora, **kw)
    return e


# ------------------------------------------------------------ XP por evento


def test_xp_por_evento():
    assert x.xp_respuesta(True) == 10
    assert x.xp_respuesta(False) == 0
    assert x.xp_fin_nivel(perfecto=False) == 20
    assert x.xp_fin_nivel(perfecto=True) == 50
    assert x.xp_fin_nivel(perfecto=True, es_jefe=True) == 150


@pytest.mark.parametrize("racha,bonus", [(0, 0), (1, 5), (3, 15), (10, 50), (25, 50)])
def test_bonus_racha(racha, bonus):
    assert x.bonus_racha(racha) == bonus


def test_completar_nivel_suma_todo():
    e, xp = x.completar_nivel(nuevo(), "docker", local(2026, 11, 1, 13), aciertos=4, perfecto=True)
    # 4×10 + 20 + 30 + racha 1 × 5
    assert xp == 95
    assert e.xp_total_por_tema["docker"] == 95
    assert e.xp_color == 100 + 95
    assert e.racha == 1


def test_bonus_racha_solo_una_vez_por_dia():
    e = jugar(nuevo(), local(2026, 11, 1, 13))
    e, xp = x.completar_nivel(e, "docker", local(2026, 11, 1, 14))
    assert xp == 20
    assert e.niveles_hoy == 2


def test_errores_no_restan():
    e = x.sumar_xp(nuevo(), "docker", -30, REGISTRO)
    assert e.xp_total_por_tema.get("docker", 0) == 0
    assert e.xp_color == 100


def test_xp_por_tema_y_tiers():
    e = x.sumar_xp(nuevo(), "docker", 950, REGISTRO)
    e = x.sumar_xp(e, "regex", 310, REGISTRO)
    assert e.tier_por_tema == {"docker": 3, "regex": 2}
    assert e.tier_maximo == 3


@pytest.mark.parametrize(
    "xp,tier",
    [(0, 1), (299, 1), (300, 2), (899, 2), (900, 3), (2000, 4), (3999, 4), (4000, 5),
     (6999, 5), (7000, 6), (10**6, 6)],
)
def test_umbral_tiers(xp, tier):
    assert x.tier_para(xp) == tier


def test_nombre_tier():
    assert x.nombre_tier(1) == "Brote" and x.nombre_tier(6) == "Leyenda"
    assert len(x.TIERS) == 6


def test_tier_maximo_sin_temas():
    assert nuevo().tier_maximo == 1


def test_xp_color_tope_3000_y_xp_total_sin_tope():
    e = x.sumar_xp(nuevo(), "docker", 5000, REGISTRO)
    assert e.xp_color == 3000
    assert e.xp_total_por_tema["docker"] == 5000


def test_xp_color_inicia_en_100():
    assert nuevo().xp_color == 100


def test_estado_inmutable():
    e = nuevo()
    with pytest.raises(AttributeError):
        e.xp_color = 5  # type: ignore[misc]
    with pytest.raises(TypeError):
        e.xp_total_por_tema["a"] = 1  # type: ignore[index]


# ------------------------------------------------------------ día de juego


def test_corte_04_00_local():
    assert x.dia_de_juego(local(2026, 11, 2, 3, 59), ZONA) == date(2026, 11, 1)
    assert x.dia_de_juego(local(2026, 11, 2, 4, 0), ZONA) == date(2026, 11, 2)


def test_zona_horaria_importa():
    ahora = datetime(2026, 11, 2, 8, 0, tzinfo=UTC)  # 02:00 CDMX, 09:00 Madrid
    assert x.dia_de_juego(ahora, ZONA) == date(2026, 11, 1)
    assert x.dia_de_juego(ahora, "Europe/Madrid") == date(2026, 11, 2)


def test_ahora_naive_falla():
    with pytest.raises(ValueError):
        x.dia_de_juego(datetime(2026, 1, 1), ZONA)


# ------------------------------------------------------------ decaimiento


def test_dia_de_registro_y_dia_en_curso_no_se_penalizan():
    e = x.liquidar_decaimiento(nuevo(), local(2026, 11, 1, 23))
    assert e.xp_color == 100
    e = x.liquidar_decaimiento(nuevo(), local(2026, 11, 2, 3, 59))  # sigue siendo el día 1
    assert e.xp_color == 100


def test_un_dia_cerrado_sin_jugar_resta_50():
    e = x.liquidar_decaimiento(nuevo(), local(2026, 11, 3, 10))
    assert e.xp_color == 50  # el día 2 se cerró sin jugar
    assert e.liquidado_hasta == date(2026, 11, 2)


def test_piso_cero():
    e = x.liquidar_decaimiento(nuevo(), local(2026, 12, 30))
    assert e.xp_color == 0


def test_idempotente():
    ahora = local(2026, 11, 5)
    e1 = x.liquidar_decaimiento(nuevo(), ahora)
    e2 = x.liquidar_decaimiento(e1, ahora)
    e3 = x.liquidar_decaimiento(e2, ahora - timedelta(days=2))
    assert e1 == e2 == e3


def test_liquidar_por_pasos_igual_que_de_golpe():
    e = x.sumar_xp(nuevo(), "t", 400, REGISTRO)
    paso = e
    for d in range(2, 12):
        paso = x.liquidar_decaimiento(paso, local(2026, 11, d))
    golpe = x.liquidar_decaimiento(e, local(2026, 11, 11))
    assert paso == golpe


def test_dia_jugado_no_decae():
    e = jugar(nuevo(), local(2026, 11, 2))
    color = e.xp_color
    e = x.liquidar_decaimiento(e, local(2026, 11, 3))
    assert e.xp_color == color


def test_escudos_cubren_primeros_dias():
    e = x.comprar_escudo(nuevo(), REGISTRO)
    e = x.comprar_escudo(e, REGISTRO)
    assert e.escudos == 2
    e = x.liquidar_decaimiento(e, local(2026, 11, 5))  # días 2, 3, 4 cerrados
    assert e.escudos == 0
    assert e.xp_color == 50


def test_maximo_dos_escudos():
    e = x.comprar_escudo(x.comprar_escudo(nuevo(), REGISTRO), REGISTRO)
    with pytest.raises(AccionInvalida):
        x.comprar_escudo(e, REGISTRO)


def test_escudo_por_7_dias_seguidos():
    e = nuevo()
    for d in range(1, 8):
        e = jugar(e, local(2026, 11, d))
    assert e.racha == 7
    assert e.escudos == 1
    for d in range(8, 22):
        e = jugar(e, local(2026, 11, d))
    assert e.racha == 21
    assert e.escudos == 2  # tope


def test_racha_se_rompe_y_escudo_no_la_protege():
    e = x.comprar_escudo(nuevo(), REGISTRO)
    e = jugar(e, local(2026, 11, 1))
    e = jugar(e, local(2026, 11, 2))
    assert e.racha == 2
    e = jugar(e, local(2026, 11, 4))  # día 3 sin jugar: lo cubre el escudo pero rompe racha
    assert e.escudos == 0
    assert e.racha == 1
    assert x.racha_vigente(e, local(2026, 11, 6)) == 0


def test_racha_continua_si_se_juega_cada_dia():
    e = nuevo()
    for d in range(1, 4):
        e, xp = x.completar_nivel(e, "t", local(2026, 11, d))
    assert e.racha == 3
    assert xp == 20 + 15


def test_jugar_despues_de_ausencia_liquida_primero():
    e = x.sumar_xp(nuevo(), "t", 400, REGISTRO)  # 500
    e, xp = x.completar_nivel(e, "t", local(2026, 11, 5))  # días 2–4 sin jugar → −150
    assert e.xp_color == 500 - 150 + xp


def test_cuenta_como_dia_false_no_marca_dia():
    e, xp = x.completar_nivel(nuevo(), "t", local(2026, 11, 1), cuenta_como_dia=False)
    assert xp == 20
    assert e.ultimo_dia_jugado is None
    assert not x.meta_diaria_cumplida(e, local(2026, 11, 1))


def test_meta_diaria_un_nivel():
    e = nuevo()
    assert not x.meta_diaria_cumplida(e, local(2026, 11, 1, 13))
    e = jugar(e, local(2026, 11, 1, 13))
    assert x.meta_diaria_cumplida(e, local(2026, 11, 1, 23))
    assert not x.meta_diaria_cumplida(e, local(2026, 11, 2, 5))


def test_ausencia_muy_larga_es_barata():
    e = x.sumar_xp(nuevo(), "t", 3000, REGISTRO)
    e = x.liquidar_decaimiento(e, datetime(2036, 1, 1, tzinfo=UTC))
    assert e.xp_color == 0 and e.racha == 0
    assert e.liquidado_hasta == date(2035, 12, 30)  # 2036-01-01 UTC es 31-dic en CDMX
