import pytest

from app.game import economia as eco
from app.game import recompensas as rc
from app.game.tipos import Rareza


def test_simulacion_cerca_del_analitico():
    r = eco.simulacion_base()
    # Ciclo de 25 niveles: 25×20 + 4×60 + 200 = 940 monedas → 37.6 por nivel
    assert r.monedas_por_nivel == pytest.approx(37.6, rel=0.02)
    assert r.monedas_por_hora == pytest.approx(r.monedas_por_nivel * 20)
    assert r.max_cofres_sin_legendario <= rc.PITY_COFRES - 1


def test_simulacion_determinista():
    a = eco.simular(50, 100, semilla=1)
    b = eco.simular(50, 100, semilla=1)
    assert a == b


def test_repetidos_bajan_ingreso():
    base = eco.simular(100, 200, semilla=3)
    rep = eco.simular(100, 200, semilla=3, fraccion_repetidos=0.5)
    assert rep.monedas_por_nivel < base.monedas_por_nivel


def test_precios_proporciones():
    precios = eco.PRECIOS
    hora = eco.simulacion_base().monedas_por_hora
    por_rareza = {r: {precios[i.id] for i in rc.items_de_rareza(r) if i.id != "escudo_color"}
                  for r in Rareza}
    (comun,) = por_rareza[Rareza.COMUN]
    (rara,) = por_rareza[Rareza.RARA]
    (legendaria,) = por_rareza[Rareza.LEGENDARIA]
    assert comun == pytest.approx(hora, rel=0.1)  # ≈ 1 h
    assert rara == pytest.approx(3 * hora, rel=0.1)  # ≈ 3 h
    assert legendaria >= 6000
    assert legendaria >= 20 * hora * 0.98  # ≥ 20 h (tolerancia de redondeo)
    assert comun < rara < legendaria


def test_mascota_legendaria_al_menos_6000():
    for item in rc.items_de_rareza(Rareza.LEGENDARIA):
        if item.clase is rc.ClaseItem.MASCOTA:
            assert eco.precio(item.id) >= 6000


def test_todos_los_items_tienen_precio_y_escudo_150():
    precios = eco.PRECIOS
    assert set(precios) == set(rc.ITEMS)
    assert precios["escudo_color"] == 150
    assert all(p % 50 == 0 and p > 0 for p in precios.values())


def test_precios_es_copia():
    eco.PRECIOS["botiquin"] = 1
    assert eco.PRECIOS["botiquin"] != 1


def test_minimo_legendario_con_economia_pobre():
    precios = eco.precios_por_rareza(100.0)
    assert precios[Rareza.COMUN] == 100
    assert precios[Rareza.RARA] == 300
    assert precios[Rareza.LEGENDARIA] == 6000


def test_atributo_desconocido():
    with pytest.raises(AttributeError):
        eco.NO_EXISTE  # noqa: B018


def test_equipables_con_precio_de_su_rareza():
    hora = eco.simulacion_base().monedas_por_hora
    for item in rc.CATALOGO:
        if item.clase in rc.EQUIPABLES:
            p = eco.precio(item.id)
            if item.rareza is Rareza.COMUN:
                assert p == pytest.approx(hora, rel=0.1)
            elif item.rareza is Rareza.RARA:
                assert p == pytest.approx(3 * hora, rel=0.1)
            else:
                assert p >= 6000
