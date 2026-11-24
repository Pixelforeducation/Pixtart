"""Validador mínimo de JSON Schema para el subconjunto que usan nuestros esquemas.

Soporta: type (str o lista), properties, required, additionalProperties: false, items,
enum, anyOf, minimum, maximum, minItems, maxItems, minLength, maxLength.
No depende de `jsonschema` para no añadir dependencias.
"""

from typing import Any

_TIPOS = {
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "string": lambda v: isinstance(v, str),
    "boolean": lambda v: isinstance(v, bool),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, int | float) and not isinstance(v, bool),
    "null": lambda v: v is None,
}


def errores_esquema(valor: Any, esquema: dict, ruta: str = "$") -> list[str]:
    """Devuelve la lista de errores (vacía si `valor` cumple `esquema`)."""
    errores: list[str] = []
    if "anyOf" in esquema:
        if not any(not errores_esquema(valor, sub, ruta) for sub in esquema["anyOf"]):
            errores.append(f"{ruta}: no coincide con ninguna alternativa")
        return errores

    tipo = esquema.get("type")
    if tipo is not None:
        tipos = tipo if isinstance(tipo, list) else [tipo]
        if not any(_TIPOS[t](valor) for t in tipos):
            return [f"{ruta}: se esperaba {tipo}"]

    if "enum" in esquema and valor not in esquema["enum"]:
        errores.append(f"{ruta}: valor fuera de {esquema['enum']}")

    if isinstance(valor, dict):
        props = esquema.get("properties", {})
        for req in esquema.get("required", []):
            if req not in valor:
                errores.append(f"{ruta}: falta '{req}'")
        if esquema.get("additionalProperties") is False:
            for k in valor:
                if k not in props:
                    errores.append(f"{ruta}: propiedad no permitida '{k}'")
        for k, sub in props.items():
            if k in valor:
                errores.extend(errores_esquema(valor[k], sub, f"{ruta}.{k}"))

    if isinstance(valor, list):
        if "minItems" in esquema and len(valor) < esquema["minItems"]:
            errores.append(f"{ruta}: mínimo {esquema['minItems']} elementos")
        if "maxItems" in esquema and len(valor) > esquema["maxItems"]:
            errores.append(f"{ruta}: máximo {esquema['maxItems']} elementos")
        if "items" in esquema:
            for i, item in enumerate(valor):
                errores.extend(errores_esquema(item, esquema["items"], f"{ruta}[{i}]"))

    if isinstance(valor, str):
        if "minLength" in esquema and len(valor) < esquema["minLength"]:
            errores.append(f"{ruta}: texto demasiado corto")
        if "maxLength" in esquema and len(valor) > esquema["maxLength"]:
            errores.append(f"{ruta}: texto demasiado largo")

    if _TIPOS["number"](valor):
        if "minimum" in esquema and valor < esquema["minimum"]:
            errores.append(f"{ruta}: menor que {esquema['minimum']}")
        if "maximum" in esquema and valor > esquema["maximum"]:
            errores.append(f"{ruta}: mayor que {esquema['maximum']}")
    return errores


_NO_SOPORTADAS_API = {"title", "minimum", "maximum", "minLength", "maxLength", "maxItems"}


def esquema_para_api(esquema: Any) -> Any:
    """Copia del esquema sin restricciones que structured outputs no acepta.

    Las restricciones quitadas se siguen comprobando localmente con `errores_esquema`.
    """
    if isinstance(esquema, dict):
        limpio = {}
        for k, v in esquema.items():
            if k in _NO_SOPORTADAS_API:
                continue
            if k == "minItems" and v not in (0, 1):
                continue
            if k == "properties":
                limpio[k] = {nombre: esquema_para_api(sub) for nombre, sub in v.items()}
            else:
                limpio[k] = esquema_para_api(v)
        return limpio
    if isinstance(esquema, list):
        return [esquema_para_api(x) for x in esquema]
    return esquema
