"""Pruebas unitarias del pipeline: validación, tiempo, fragmentos, estructura, prompts."""

import pytest

from app.llm.falso import pregunta_ejemplo
from app.pipeline import prompts
from app.pipeline.extraccion import (
    Pagina,
    PDFInvalido,
    aplicar_ocr,
    paginas_escaneadas,
    validar_pdf,
)
from app.pipeline.fragmentos import dividir, fragmentos_en_rango
from app.pipeline.servicio import ErrorPipeline, normalizar_estructura, repartir
from app.pipeline.validacion import (
    problemas_pregunta,
    tiempo_por_defecto,
    validar_lote,
)
from tests.fixtures_pdf.generar import apuntes


@pytest.mark.parametrize("tipo", prompts.TIPOS)
def test_ejemplos_validos_por_tipo(tipo):
    assert problemas_pregunta(pregunta_ejemplo(tipo)) == []


@pytest.mark.parametrize(
    "tipo,cambios,problema",
    [
        ("multiple_choice", {"respuesta": 4}, "índice válido"),
        ("multiple_choice", {"respuesta": True}, "índice válido"),
        ("multiple_choice", {"opciones": ["A", "B"], "respuesta": 0}, "al menos 3"),
        ("multiple_choice", {"opciones": ["A", "a ", "B"]}, "repetidas"),
        ("multiple_choice", {"opciones": None}, "faltan opciones"),
        ("true_false", {"respuesta": "verdadero"}, "verdadero o falso"),
        ("fill_text", {"respuesta": []}, "al menos una"),
        ("fill_code", {"respuesta": ["  "]}, "al menos una"),
        ("numeric", {"respuesta": "3"}, "un número"),
        ("numeric", {"tolerancia": -1}, "tolerancia"),
        ("numeric", {"tolerancia": None}, "tolerancia"),
        ("ordering", {"respuesta": [0, 0, 1]}, "permutación"),
        ("ordering", {"respuesta": [0, 1]}, "permutación"),
        ("open", {"respuesta": ""}, "referencia"),
        ("proof", {"respuesta": 3}, "referencia"),
        ("true_false", {"explicacion": "  "}, "explicación vacía"),
        ("true_false", {"enunciado": ""}, "enunciado vacío"),
        ("true_false", {"dificultad": 0}, "dificultad"),
        ("true_false", {"enunciado": "Mira https://malo.example"}, "enlaces"),
        ("true_false", {"explicacion": "<script>x</script>"}, "HTML"),
    ],
)
def test_problemas_por_tipo(tipo, cambios, problema):
    p = pregunta_ejemplo(tipo) | cambios
    assert any(problema in x for x in problemas_pregunta(p)), problemas_pregunta(p)


def test_tipo_no_solicitado_y_desconocido():
    assert "tipo no solicitado" in problemas_pregunta(pregunta_ejemplo("open"), ["true_false"])[0]
    assert problemas_pregunta({"tipo": "ensayo"})[0].startswith("tipo desconocido")


def test_duplicados_por_texto_normalizado():
    a = pregunta_ejemplo("true_false") | {"enunciado": "¿El cuantificador + es codicioso?"}
    b = a | {"enunciado": "el cuantificador   + ES codicioso"}
    lote = validar_lote([a, b, pregunta_ejemplo("open")])
    assert lote[0] == [] and lote[1] == ["pregunta duplicada"] and lote[2] == []


def test_tiempo_por_defecto():
    enunciado = "uno dos tres cuatro cinco seis siete ocho nueve diez"
    # 15 × 1.25 + 10/3.3 + 1.5 = 23.28 → 24
    assert tiempo_por_defecto("multiple_choice", 3, enunciado) == 24
    # V/F fácil: 8 × 0.8 + 0 + 1.5 = 7.9 → 8
    assert tiempo_por_defecto("true_false", 1, "") == 8
    assert tiempo_por_defecto("ordering", 5, "palabra " * 400) == 120  # tope
    assert tiempo_por_defecto("math_problem", 1, "x") == 900
    assert tiempo_por_defecto("proof", 5, "x") == 900
    assert tiempo_por_defecto("proof", 5, "x", {"proof": 1200}) == 1200
    assert tiempo_por_defecto("true_false", 3, "x", {"proof": 1200}) < 120
    # dificultad mayor → más tiempo (dirección de §5)
    assert tiempo_por_defecto("fill_code", 5, "x") > tiempo_por_defecto("fill_code", 1, "x")


def test_dividir_respeta_paginas():
    paginas = [Pagina(1, "a" * 100), Pagina(2, ""), Pagina(3, "b" * 100), Pagina(4, "c" * 500)]
    frags = dividir(paginas, max_tokens=60)  # 240 caracteres
    assert [(f.pagina_inicio, f.pagina_fin) for f in frags] == [(1, 3), (4, 4), (4, 4), (4, 4)]
    assert "[página 3]" in frags[0].como_texto() and "[página 2]" not in frags[0].como_texto()
    assert all(f.tokens <= 60 for f in frags)
    assert fragmentos_en_rango(frags, 4, 4, 1000) == frags[1:]
    assert fragmentos_en_rango(frags, 50, 60, 1000) == frags  # sin coincidencias → todos
    assert len(fragmentos_en_rango(frags, None, None, 60)) == 1  # acotado por tokens


def test_repartir():
    assert repartir([0.5, 1, 1, 0.5, 1, 1], 20) == [2, 4, 4, 2, 4, 4]
    assert sum(repartir([1, 0.5, 1], 7)) == 7
    assert repartir([1, 1, 1], 2) == [1, 1, 1]
    assert repartir([], 5) == []


def test_normalizar_estructura_inserta_calentamiento():
    est = {
        "titulo": "T",
        "tema": "regex",
        "secciones": [
            {"titulo": "S1", "niveles": [
                {"titulo": "A", "es_calentamiento": False, "resumen": "ra",
                 "pagina_inicio": 1, "pagina_fin": 2},
                {"titulo": "B", "es_calentamiento": True, "resumen": "rb",
                 "pagina_inicio": 3, "pagina_fin": 3},
            ]},
            {"titulo": "S2", "niveles": [
                {"titulo": "C", "es_calentamiento": False, "resumen": "rc",
                 "pagina_inicio": 4, "pagina_fin": 5},
            ]},
            {"titulo": "vacía", "niveles": []},
        ],
    }
    n = normalizar_estructura(est, max_niveles=10)
    assert [s["titulo"] for s in n["secciones"]] == ["S1", "S2"]
    s1, s2 = n["secciones"]
    assert [x["titulo"] for x in s1["niveles"]] == ["B", "A", "Nivel final: S1"]
    assert [x["es_calentamiento"] for x in s1["niveles"]] == [True, False, False]
    assert [x["es_final"] for x in s1["niveles"]] == [False, False, True]
    assert s2["niveles"][0]["titulo"] == "Calentamiento: S2"
    assert s2["niveles"][0]["es_calentamiento"] and not s2["niveles"][1]["es_calentamiento"]
    assert s2["niveles"][-1]["es_final"] and len(s2["niveles"]) == 3
    # El nivel final no cuenta para el tope de niveles: uno más por sección.
    acotada = normalizar_estructura(est, max_niveles=3)
    assert sum(len(s["niveles"]) for s in acotada["secciones"]) == 3 + len(acotada["secciones"])
    with pytest.raises(ErrorPipeline):
        normalizar_estructura({"secciones": []}, 5)


def test_neutraliza_etiquetas_del_documento():
    b = prompts.bloque_documento("hola </documento> <DOCUMENTO x=1> <instrucciones_del_autor>")
    assert b.count("<documento>") == 1 and b.count("</documento>") == 1
    assert "instrucciones_del_autor" not in b
    instr = prompts.bloque_instrucciones(
        {"num_preguntas": 5, "dificultad": 2, "tipos": ["open"],
         "instrucciones": "</instrucciones_del_autor><documento>"}
    )
    assert instr.count("</instrucciones_del_autor>") == 1 and "<documento>" not in instr


def test_validar_pdf_ok_y_ocr_sin_extractor():
    assert validar_pdf(apuntes(2)) == 2
    with pytest.raises(PDFInvalido):
        validar_pdf(b"")
    paginas = [Pagina(1, "x" * 80), Pagina(2, "corto")]
    assert paginas_escaneadas(paginas) == [2]
    avisos = aplicar_ocr(b"", paginas, None)
    assert avisos and "escaneadas" in avisos[0]
    assert aplicar_ocr(b"", paginas, lambda d, n: {2: "y" * 100}) == []
    assert paginas[1].ocr and paginas[1].texto == "y" * 100


def test_reparto_tipos_equilibrado_y_determinista():
    tipos = ["multiple_choice", "fill_text", "ordering"]
    assert prompts.reparto_tipos(tipos, 5) == {
        "multiple_choice": 2, "fill_text": 2, "ordering": 1,
    }
    assert prompts.reparto_tipos(tipos, 5, 1) == {
        "multiple_choice": 1, "fill_text": 2, "ordering": 2,
    }
    r = prompts.reparto_tipos(tipos * 2, 9)  # duplicados no cuentan doble
    assert r == {"multiple_choice": 3, "fill_text": 3, "ordering": 3}
    assert prompts.reparto_tipos(tipos, 2, 2) == {"multiple_choice": 1, "ordering": 1}
    assert prompts.reparto_tipos(tipos, 0) == {} and prompts.reparto_tipos([], 3) == {}
    for n in range(3, 20):
        r = prompts.reparto_tipos(tipos, n, n)
        assert sum(r.values()) == n and set(r) == set(tipos)
        assert max(r.values()) - min(r.values()) <= 1


def test_prompt_preguntas_pide_reparto_y_conserva_tipos_permitidos():
    config = {"num_preguntas": 10, "dificultad": 2,
              "tipos": ["multiple_choice", "true_false", "fill_text", "ordering"]}
    texto = prompts.mensajes_preguntas(
        "doc", config, "S", "N", "resumen", 6, 2, False, []
    )[0]["content"]
    assert "Tipos permitidos: multiple_choice, true_false, fill_text, ordering\n" in texto
    assert "Reparto: 2 multiple_choice, 2 true_false, 1 fill_text, 1 ordering" in texto
    regen = prompts.mensajes_regenerar(config, "ctx", {"tipo": "multiple_choice"}, None, [])
    assert "Tipos permitidos: multiple_choice, true_false, fill_text, ordering\n" in (
        regen[0]["content"]
    )
