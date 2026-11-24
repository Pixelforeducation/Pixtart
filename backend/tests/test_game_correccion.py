import pytest

from app.game.correccion import Correccion, autoevaluar, corregir, normalizar, quitar_acentos
from app.game.tipos import Pregunta, TipoPregunta

OK, MAL, AUTO = Correccion.CORRECTA, Correccion.INCORRECTA, Correccion.AUTOEVALUAR
MC = Pregunta("1", TipoPregunta.MULTIPLE_CHOICE, "", 2, opciones=("a", "b", "c"))
VF = Pregunta("2", TipoPregunta.TRUE_FALSE, "", False)
FT = Pregunta("3", TipoPregunta.FILL_TEXT, "", ("Canción", "cancion de cuna"))
FC = Pregunta("4", TipoPregunta.FILL_CODE, "", ("docker run -d",))
NUM = Pregunta("5", TipoPregunta.NUMERIC, "", 3.14, tolerancia=0.01)
NUM0 = Pregunta("6", TipoPregunta.NUMERIC, "", 0.3)
ORD = Pregunta("7", TipoPregunta.ORDERING, "", (2, 0, 1))


@pytest.mark.parametrize("resp,esp", [(2, OK), (1, MAL), ("2", MAL), (True, MAL), (None, MAL)])
def test_mc(resp, esp):
    assert corregir(MC, resp) is esp


@pytest.mark.parametrize("resp,esp", [(False, OK), (True, MAL), (0, MAL), ("false", MAL)])
def test_vf(resp, esp):
    assert corregir(VF, resp) is esp


@pytest.mark.parametrize(
    "resp,esp",
    [
        ("Canción", OK),
        ("  canción ", OK),
        ("CANCIÓN", OK),
        ("cancion   de\tcuna", OK),
        ("cancion", MAL),  # sin ignorar acentos
        ("", MAL),
        (5, MAL),
    ],
)
def test_fill_text(resp, esp):
    assert corregir(FT, resp) is esp


def test_fill_text_ignorando_acentos():
    assert corregir(FT, "CANCION", ignorar_acentos=True) is OK
    assert corregir(FT, "Cáncion de cúna", ignorar_acentos=True) is OK


@pytest.mark.parametrize(
    "resp,esp",
    [("docker run -d", OK), (" docker  run   -d ", OK), ("Docker run -d", MAL), ("docker run", MAL)],
)
def test_fill_code_distingue_mayusculas(resp, esp):
    assert corregir(FC, resp) is esp


@pytest.mark.parametrize(
    "resp,esp",
    [(3.14, OK), (3.15, OK), (3.13, OK), (3.16, MAL), ("3,14", OK), (" 3.141 ", OK), ("pi", MAL),
     (True, MAL), (float("nan"), MAL), (float("inf"), MAL), (None, MAL), (3, MAL)],
)
def test_numeric_tolerancia(resp, esp):
    assert corregir(NUM, resp) is esp


def test_numeric_sin_tolerancia_absorbe_flotante():
    assert corregir(NUM0, 0.1 + 0.2) is OK
    assert corregir(NUM0, 0.31) is MAL


@pytest.mark.parametrize(
    "resp,esp",
    [([2, 0, 1], OK), ((2, 0, 1), OK), ([0, 1, 2], MAL), ([2, 0], MAL), (["2", "0", "1"], MAL),
     ("201", MAL), ([True, False, True], MAL)],
)
def test_ordering(resp, esp):
    assert corregir(ORD, resp) is esp


@pytest.mark.parametrize("tipo", [TipoPregunta.OPEN, TipoPregunta.MATH_PROBLEM, TipoPregunta.PROOF])
def test_abiertas_se_autoevaluan(tipo):
    p = Pregunta("8", tipo, "", "referencia")
    assert corregir(p, "lo que sea") is AUTO
    assert autoevaluar(p, True) is OK
    assert autoevaluar(p, False) is MAL


def test_autoevaluar_solo_abiertas():
    with pytest.raises(ValueError):
        autoevaluar(MC, True)


def test_normalizar_y_acentos():
    assert normalizar("  Hola   Mundo ") == "hola mundo"
    assert normalizar("Ñandú", acentos=True) == "nandu"
    assert normalizar("ABC", mayusculas=False) == "ABC"
    assert quitar_acentos("áéíóú") == "aeiou"


def test_pregunta_desde_dict_del_contrato():
    p = Pregunta.desde_dict(
        {"id": 7, "tipo": "ordering", "enunciado": "x", "respuesta": [1, 0], "dificultad": 2}
    )
    assert p.id == "7" and p.respuesta == (1, 0) and p.tipo is TipoPregunta.ORDERING
    assert corregir(p, [1, 0]) is OK
    f = Pregunta.desde_dict({"id": "a", "tipo": "fill_text", "respuesta": ["sí"], "opciones": None})
    assert f.opciones == () and corregir(f, "SÍ") is OK
