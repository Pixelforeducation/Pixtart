from app.pipeline.barajado import barajar


def _correcto(d):
    return [d["opciones"][i] for i in d["respuesta"]]


def test_ordering_no_queda_resuelto_y_conserva_la_respuesta():
    pasos = ["uno", "dos", "tres", "cuatro"]
    for k in range(30):
        d = {"tipo": "ordering", "enunciado": f"Ordena {k}", "opciones": pasos,
             "respuesta": [0, 1, 2, 3]}
        b = barajar(d)
        assert b["opciones"] != pasos
        assert _correcto(b) == pasos


def test_mc_conserva_la_opcion_correcta_y_varia_la_posicion():
    posiciones = set()
    for k in range(30):
        d = {"tipo": "multiple_choice", "enunciado": f"P{k}", "opciones": ["a", "b", "c", "d"],
             "respuesta": 0}
        b = barajar(d)
        assert b["opciones"][b["respuesta"]] == "a"
        posiciones.add(b["respuesta"])
    assert len(posiciones) > 1


def test_determinista_y_tolerante_a_formas_raras():
    d = {"tipo": "ordering", "enunciado": "x", "opciones": ["a", "b", "c"], "respuesta": [2, 0, 1]}
    assert barajar(d) == barajar(d)
    assert _correcto(barajar(d)) == ["c", "a", "b"]
    raro = {"tipo": "ordering", "enunciado": "x", "opciones": ["a", "b"], "respuesta": [0, 0]}
    assert barajar(raro) is raro
    assert barajar({"tipo": "numeric", "respuesta": 3}) == {"tipo": "numeric", "respuesta": 3}


def test_almacen_disco(tmp_path):
    import pytest

    from app.pipeline.almacen import AlmacenDisco

    a = AlmacenDisco(str(tmp_path))
    a.guardar("u1/doc.pdf", b"%PDF-1.4")
    assert a.existe("u1/doc.pdf") and a.leer("u1/doc.pdf") == b"%PDF-1.4"
    a.borrar("u1/doc.pdf")
    assert not a.existe("u1/doc.pdf")
    with pytest.raises(ValueError):
        a.guardar("../fuera.pdf", b"x")
