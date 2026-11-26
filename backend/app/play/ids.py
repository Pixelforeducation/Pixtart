"""Ids públicos de ítems (los que usa el frontend) ↔ ids internos de `app.game.recompensas`.

- `comida_mascota` ↔ `comida`, `escudo_color` ↔ `escudo`.
- Mascotas: `mascota_<especie>` (p. ej. `mascota_seti` ↔ `mascota_mushroom-sprout`).
- El resto se queda igual (`botiquin`, `pocion_resurreccion`, `pocion_tiempo`, `lupa`) y los
  equipables (`arma_*`, `armadura_*`, `ropa_*`) también: su id interno es el público.
"""

from app.game import recompensas as rc

_RENOMBRES = {"comida_mascota": "comida", "escudo_color": "escudo"}

A_PUBLICO: dict[str, str] = {}
for _i in rc.CATALOGO:
    if _i.clase is rc.ClaseItem.MASCOTA:
        A_PUBLICO[_i.id] = f"mascota_{_i.especie}"
    elif _i.clase in rc.EQUIPABLES:
        A_PUBLICO[_i.id] = _i.id
    else:
        A_PUBLICO[_i.id] = _RENOMBRES.get(_i.id, _i.id)
A_INTERNO: dict[str, str] = {v: k for k, v in A_PUBLICO.items()}
assert len(A_INTERNO) == len(A_PUBLICO)


def publico(interno: str) -> str:
    return A_PUBLICO.get(interno, interno)


def interno(publico_id: str) -> str | None:
    """Id interno, o None si no existe."""
    return A_INTERNO.get(publico_id)
