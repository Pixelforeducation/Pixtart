import random
from collections import Counter

import pytest

from app.game import recompensas as rc
from app.game.tipos import Rareza


def test_catalogo_minimo():
    ids = set(rc.ITEMS)
    for requerido in (
        "botiquin", "pocion_tiempo", "lupa", "comida_mascota", "pocion_resurreccion",
        "escudo_color",
    ):
        assert requerido in ids
    assert rc.ITEMS["pocion_resurreccion"].rareza is Rareza.RARA
    for rareza in Rareza:
        mascotas = [i for i in rc.items_de_rareza(rareza) if i.clase is rc.ClaseItem.MASCOTA]
        assert mascotas, f"sin mascotas {rareza}"
        assert all(i.especie for i in mascotas)
    assert rc.ITEMS[rc.MASCOTA_INICIAL].rareza is Rareza.COMUN


def test_tabla_item_suma_8_por_ciento():
    assert sum(p for _, p in rc.RAREZA_ITEM_NIVEL) == rc.PROB_ITEM_NIVEL == 800
    assert rc.PROB_ITEM_NIVEL / rc.ESCALA == 0.08


def test_drop_siempre_da_monedas():
    rng = random.Random(1)
    e = rc.EstadoCofres()
    for _ in range(2000):
        e, d = rc.drop_nivel(e, rng)
        assert 10 <= d.monedas <= 30


def test_probabilidad_item_cerca_de_8():
    rng = random.Random(2)
    n = 50_000
    con_item = sum(rc.drop_nivel(rc.EstadoCofres(), rng)[1].item is not None for _ in range(n))
    assert con_item / n == pytest.approx(0.08, abs=0.006)


def test_rareza_del_item_de_nivel():
    rng = random.Random(3)
    cuenta = Counter(rc.elegir_ponderado(rng, rc.RAREZA_ITEM_NIVEL) for _ in range(40_000))
    assert cuenta[Rareza.COMUN] / 40_000 == pytest.approx(500 / 800, abs=0.015)
    assert cuenta[Rareza.RARA] / 40_000 == pytest.approx(299 / 800, abs=0.015)


def test_repetido_5_a_10_sin_item_ni_contador():
    rng = random.Random(4)
    e = rc.EstadoCofres(niveles_desde_cofre=4)
    for _ in range(500):
        e2, d = rc.drop_nivel(e, rng, repetido=True)
        assert 5 <= d.monedas <= 10
        assert d.item is None and d.cofre is None
        assert e2 == e


def test_cofre_cada_5_niveles_y_legendario_tras_4_normales():
    rng = random.Random(5)
    e = rc.EstadoCofres()
    cofres = []
    for nivel in range(1, 51):
        e, d = rc.drop_nivel(e, rng)
        if d.cofre:
            cofres.append((nivel, d.cofre))
    N, L = rc.TipoCofre.NORMAL, rc.TipoCofre.LEGENDARIO
    assert cofres == [
        (5, N), (10, N), (15, N), (20, N), (25, L),
        (30, N), (35, N), (40, N), (45, N), (50, L),
    ]


def test_proximo_cofre():
    assert rc.proximo_cofre(rc.EstadoCofres()) is rc.TipoCofre.NORMAL
    assert rc.proximo_cofre(rc.EstadoCofres(normales_desde_legendario=4)) is rc.TipoCofre.LEGENDARIO


def test_nivel_final_da_cofre_legendario_sin_tocar_ciclo():
    e = rc.EstadoCofres(niveles_desde_cofre=2, normales_desde_legendario=1)
    e2, d = rc.drop_nivel(e, random.Random(0), es_final=True)
    assert d.cofre is rc.TipoCofre.LEGENDARIO
    assert e2 == e


@pytest.mark.parametrize("tipo,rango", [("normal", (40, 80)), ("legendario", (150, 250))])
def test_contenido_cofre(tipo, rango):
    rng = random.Random(6)
    e = rc.EstadoCofres()
    for _ in range(500):
        e, c = rc.abrir_cofre(e, tipo, rng)
        assert rango[0] <= c.monedas <= rango[1]
        assert len(c.items) == 2
        assert rc.ITEMS[c.items[0]].rareza is Rareza.RARA  # raro garantizado


def _tasa_legendario(tipo, n=40_000, seed=7):
    rng = random.Random(seed)
    hits = 0
    for _ in range(n):
        # estado limpio para medir la tasa base sin pity
        _, c = rc.abrir_cofre(rc.EstadoCofres(), tipo, rng)
        hits += c.trae_legendario
    return hits / n


def test_legendario_1_por_ciento_en_normal():
    assert _tasa_legendario(rc.TipoCofre.NORMAL) == pytest.approx(0.01, abs=0.002)


def test_legendario_10_por_ciento_en_legendario():
    assert _tasa_legendario(rc.TipoCofre.LEGENDARIO) == pytest.approx(0.10, abs=0.006)


def test_a_lo_sumo_un_legendario_por_cofre():
    rng = random.Random(8)
    for _ in range(5000):
        _, c = rc.abrir_cofre(rc.EstadoCofres(), "legendario", rng)
        assert sum(rc.ITEMS[i].rareza is Rareza.LEGENDARIA for i in c.items) <= 1


def test_pity_cofre_30_garantizado():
    e = rc.EstadoCofres(cofres_sin_legendario=29)
    for seed in range(50):
        e2, c = rc.abrir_cofre(e, "normal", random.Random(seed))
        assert c.trae_legendario
        assert e2.cofres_sin_legendario == 0


def test_pity_no_antes():
    rng = random.Random(9)
    e = rc.EstadoCofres(cofres_sin_legendario=28)
    resultados = [rc.abrir_cofre(e, "normal", rng)[1].trae_legendario for _ in range(200)]
    assert not all(resultados)


def test_nunca_mas_de_30_cofres_sin_legendario():
    rng = random.Random(10)
    e = rc.EstadoCofres()
    seguidos = peor = 0
    for _ in range(20_000):
        e, c = rc.abrir_cofre(e, "normal", rng)
        seguidos = 0 if c.trae_legendario else seguidos + 1
        peor = max(peor, seguidos)
        assert e.cofres_sin_legendario == seguidos
    assert peor == 29


def test_contador_pity_sube_sin_legendario():
    # Semilla elegida para que el primer cofre no traiga legendario
    rng = random.Random(11)
    e, c = rc.abrir_cofre(rc.EstadoCofres(), "normal", rng)
    assert not c.trae_legendario and e.cofres_sin_legendario == 1


def test_determinista_con_seed():
    def corrida(seed):
        rng, e, salida = random.Random(seed), rc.EstadoCofres(), []
        for _ in range(30):
            e, d = rc.drop_nivel(e, rng)
            salida.append(d)
            if d.cofre:
                e, c = rc.abrir_cofre(e, d.cofre, rng)
                salida.append(c)
        return salida

    assert corrida(42) == corrida(42)
    assert corrida(42) != corrida(43)
