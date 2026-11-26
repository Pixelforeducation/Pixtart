import pytest

from app.game import evolucion_mascota as ev
from app.game import mascota as m
from app.game.tipos import Rareza


@pytest.mark.parametrize(
    "xp,etapa,siguiente",
    [(0, 1, 60), (59, 1, 60), (60, 2, 200), (199, 2, 200), (200, 3, None), (999, 3, None)],
)
def test_etapas_y_siguiente(xp, etapa, siguiente):
    assert ev.etapa(xp) == etapa
    assert ev.xp_siguiente(xp) == siguiente


def test_racha_sin_ayuda_da_xp_creciente():
    e, ganadas = ev.EvolucionMascota(), []
    for _ in range(12):
        e, x = ev.registrar_respuesta(e, correcta=True, uso_ayuda=False, perdio_vida=False)
        ganadas.append(x)
    # racha 1..12 → 2 + min(3, racha // 3)
    assert ganadas == [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 5]
    assert e.racha_sin_ayuda == 12 and e.xp == sum(ganadas)


@pytest.mark.parametrize(
    "correcta,uso_ayuda,perdio_vida",
    [(True, True, False), (False, False, True), (False, False, False)],
)
def test_ayuda_o_fallo_corta_racha_sin_xp(correcta, uso_ayuda, perdio_vida):
    e = ev.EvolucionMascota(xp=30, racha_sin_ayuda=5)
    e2, x = ev.registrar_respuesta(
        e, correcta=correcta, uso_ayuda=uso_ayuda, perdio_vida=perdio_vida
    )
    assert x == 0 and e2 == ev.EvolucionMascota(xp=30, racha_sin_ayuda=0)


def test_inmutable():
    with pytest.raises(AttributeError):
        ev.EvolucionMascota().xp = 3  # type: ignore[misc]


@pytest.mark.parametrize(
    "ayudas,vidas,aprobado,bonus",
    [(0, 0, True, 10), (0, 2, True, 4), (1, 0, True, 4), (1, 1, True, 0), (0, 0, False, 0)],
)
def test_bonus_nivel(ayudas, vidas, aprobado, bonus):
    assert ev.bonus_nivel(ayudas_usadas=ayudas, vidas_perdidas=vidas, aprobado=aprobado) == bonus


def test_etapa_3_da_ayuda_extra():
    assert ev.AYUDA_EXTRA_ETAPA_3 == 1
    for r, base in ((Rareza.COMUN, 1), (Rareza.RARA, 2), (Rareza.LEGENDARIA, 3)):
        assert m.cupo_ayudas(r, False) == base
        assert m.cupo_ayudas(r, False, etapa=2) == base
        assert m.cupo_ayudas(r, False, etapa=3) == base + 1
    assert m.cupo_ayudas(Rareza.COMUN, True, etapa=3) == 1  # hambre 0 + 1 extra
