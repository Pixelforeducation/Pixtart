import json
from pathlib import Path

import pytest

from app.game import paletas as p

ORIGEN = (
    Path(__file__).resolve().parents[4]
    / "Picstart" / "design" / "mockups" / "07-palettes" / "palettes.json"
)


def test_ocho_paletas_ordenadas():
    ps = p.paletas()
    assert len(ps) == 8
    umbrales = [x.xp_color_min for x in ps]
    assert umbrales == sorted(umbrales)
    assert ps[0].id == "gris" and ps[0].xp_color_min == 0
    assert ps[-1].id == "cosmica" and ps[-1].xp_color_min == 2500


def test_umbrales_conocidos():
    esperado = {
        "gris": 0, "pradera": 100, "oceano": 250, "atardecer": 500, "bosque-noche": 800,
        "volcan": 1200, "aurora": 1800, "cosmica": 2500,
    }
    assert {x.id: x.xp_color_min for x in p.paletas()} == esperado


def test_decaimiento_del_json_coincide_con_regla():
    from app.game.experiencia import DECAIMIENTO_POR_DIA

    assert p.decaimiento_por_dia() == DECAIMIENTO_POR_DIA == 50


@pytest.mark.skipif(not ORIGEN.exists(), reason="repositorio de diseño no disponible")
def test_copia_identica_al_diseno():
    assert json.loads(p.RUTA_PALETAS.read_text()) == json.loads(ORIGEN.read_text())


@pytest.mark.parametrize(
    "xp,ids",
    [
        (0, ["gris"]),
        (-5, ["gris"]),
        (99, ["gris"]),
        (100, ["gris", "pradera"]),
        (500, ["gris", "pradera", "oceano", "atardecer"]),
    ],
)
def test_desbloqueadas(xp, ids):
    assert p.desbloqueadas(xp) == ids


def test_todas_con_3000():
    assert len(p.desbloqueadas(3000)) == 8
    assert p.mejor_desbloqueada(3000) == "cosmica"
    assert p.siguiente_paleta(3000) is None


def test_efectiva_preferida_desbloqueada():
    assert p.paleta_efectiva(1300, "oceano") == "oceano"
    assert p.paleta_efectiva(1300, "gris") == "gris"


def test_efectiva_cae_a_la_mejor():
    assert p.paleta_efectiva(1300, "cosmica") == "volcan"
    assert p.paleta_efectiva(1300, None) == "volcan"
    assert p.paleta_efectiva(0, "pradera") == "gris"
    assert p.paleta_efectiva(1300, "no-existe") == "volcan"


def test_preferida_vuelve_sola_al_recuperar_xp():
    assert p.paleta_efectiva(700, "bosque-noche") == "atardecer"
    assert p.paleta_efectiva(800, "bosque-noche") == "bosque-noche"


def test_siguiente_paleta_y_lookup():
    assert p.siguiente_paleta(100).id == "oceano"
    assert p.paleta("volcan").nombre == "Volcán"
    with pytest.raises(KeyError):
        p.paleta("nada")
