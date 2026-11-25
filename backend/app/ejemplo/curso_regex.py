"""Curso de ejemplo "Expresiones regulares" para jugar Pixtart sin API key.

Uso (con Docker corriendo):
    docker compose exec api python -m app.ejemplo.curso_regex --correo tu@correo.com

El usuario debe existir (regístrate antes en la web). Si ya tiene el curso de ejemplo, no se
duplica a menos que pases --reemplazar. Las preguntas pasan por la misma validación,
barajado y fórmula de tiempo que las generadas por la IA.
"""

import argparse
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

import app.models  # noqa: F401
from app.models.cursos import Curso, Nivel, Pregunta, Seccion
from app.models.usuarios import Usuario
from app.pipeline.barajado import barajar
from app.pipeline.validacion import tiempo_por_defecto, validar_lote

TITULO = "Expresiones regulares (ejemplo)"
TEMA = "Regex"


def _mc(enunciado, opciones, correcta, explicacion, pista=None, dificultad=2):
    return dict(tipo="multiple_choice", enunciado=enunciado, opciones=opciones,
                respuesta=correcta, explicacion=explicacion, pista=pista, dificultad=dificultad)


def _vf(enunciado, valor, explicacion, pista=None, dificultad=1):
    return dict(tipo="true_false", enunciado=enunciado, respuesta=valor,
                explicacion=explicacion, pista=pista, dificultad=dificultad)


def _fill(tipo, enunciado, aceptadas, explicacion, pista=None, dificultad=2):
    return dict(tipo=tipo, enunciado=enunciado, respuesta=aceptadas,
                explicacion=explicacion, pista=pista, dificultad=dificultad)


def _num(enunciado, valor, explicacion, tolerancia=0, pista=None, dificultad=2):
    return dict(tipo="numeric", enunciado=enunciado, respuesta=valor, tolerancia=tolerancia,
                explicacion=explicacion, pista=pista, dificultad=dificultad)


def _orden(enunciado, pasos_en_orden, explicacion, pista=None, dificultad=3):
    return dict(tipo="ordering", enunciado=enunciado, opciones=pasos_en_orden,
                respuesta=list(range(len(pasos_en_orden))), explicacion=explicacion,
                pista=pista, dificultad=dificultad)


def _abierta(tipo, enunciado, referencia, explicacion, pista=None, dificultad=3):
    return dict(tipo=tipo, enunciado=enunciado, respuesta=referencia,
                explicacion=explicacion, pista=pista, dificultad=dificultad)


# (sección, [(nivel, es_calentamiento, [preguntas])])
CURSO = [
    ("Lo básico", [
        ("Calentamiento: ¿qué es un patrón?", True, [
            _vf("Una expresión regular describe un patrón de texto.", True,
                "Una regex es una descripción compacta de un conjunto de cadenas."),
            _vf("La regex `gato` coincide con la palabra «gatos».", True,
                "Sin anclas, `gato` aparece dentro de «gatos», así que hay coincidencia.",
                pista="Piensa si «gato» aparece como parte de «gatos»."),
            _mc("¿Qué encuentra la regex `sol` en el texto «girasol al sol»?",
                ["Dos coincidencias", "Una coincidencia", "Ninguna", "Solo «girasol»"], 0,
                "Aparece dentro de «girasol» y como palabra «sol»: dos coincidencias.",
                dificultad=1),
        ]),
        ("El punto y las clases", False, [
            _mc("¿Con qué coincide el metacaracter `.`?",
                ["Con cualquier carácter (salvo salto de línea)", "Solo con un punto",
                 "Con cualquier dígito", "Con el final de la línea"], 0,
                "`.` coincide con un carácter cualquiera; para un punto literal se escribe `\\.`.",
                pista="Es un comodín de un solo carácter."),
            _mc("¿Qué cadenas coinciden completas con `c[aeo]sa`?",
                ["casa, cesa, cosa", "casa, cusa", "cosa, cxsa", "c[aeo]sa literal"], 0,
                "`[aeo]` es una clase: exactamente un carácter entre a, e u o.",
                pista="Los corchetes eligen UN carácter de la lista."),
            _fill("fill_code", "Completa la clase que acepta cualquier dígito del 0 al 9: `[___]`",
                  ["0-9"], "Un rango dentro de corchetes: `[0-9]`. También existe `\\d`.",
                  pista="Usa un guion entre el primero y el último."),
            _vf("`[^0-9]` coincide con cualquier carácter que NO sea un dígito.", True,
                "`^` al inicio de una clase la niega.", dificultad=2),
            _num("¿Cuántas coincidencias tiene `[aeiou]` en la palabra «regex»?", 2,
                 "Las vocales de «regex» son e y e: dos coincidencias.",
                 pista="Cuenta las vocales."),
        ]),
        ("Cuantificadores", False, [
            _mc("¿Qué significa `a+`?",
                ["Una o más «a»", "Cero o más «a»", "Exactamente una «a»", "Cero o una «a»"], 0,
                "`+` repite el elemento anterior una o más veces.",
                pista="Compáralo con `*`, que permite cero."),
            _mc("¿Cuál de estas cadenas NO coincide completa con `colou?r`?",
                ["colouur", "color", "colour", "Ninguna de las otras dos falla"], 0,
                "`u?` permite cero o una «u»; «colouur» tiene dos.", dificultad=2),
            _fill("fill_code", "Escribe el cuantificador que exige exactamente 3 repeticiones: `\\d___`",
                  ["{3}"], "Las llaves fijan el número de repeticiones: `\\d{3}` son tres dígitos."),
            _num("¿Cuántas coincidencias encuentra `a+` en «aa b aaa»?", 2,
                 "`a+` toma bloques consecutivos: «aa» y «aaa». Son dos coincidencias.",
                 pista="Cada bloque de «a» seguidas es una sola coincidencia."),
            _vf("`.*` es codicioso: intenta tomar la coincidencia más larga posible.", True,
                "Por defecto los cuantificadores son codiciosos; `.*?` es la versión perezosa.",
                dificultad=3),
        ]),
    ]),
    ("Patrones con estructura", [
        ("Calentamiento: anclas", True, [
            _vf("`^` fuera de corchetes ancla el patrón al inicio de la línea.", True,
                "`^hola` solo coincide si «hola» está al principio."),
            _mc("¿Qué hace `$` en `fin$`?",
                ["Ancla al final de la línea", "Busca el símbolo de dólar", "Repite «fin»",
                 "Niega el patrón"], 0, "`$` es el ancla de final de línea.", dificultad=1),
        ]),
        ("Grupos y alternativas", False, [
            _mc("¿Con qué coincide `(gato|perro)s?`?",
                ["gato, gatos, perro, perros", "Solo gatos y perros", "gatoperro", "gato|perro literal"],
                0, "`|` elige una alternativa y `s?` hace opcional la «s».",
                pista="El paréntesis agrupa las dos opciones."),
            _fill("fill_text", "En una regex, los paréntesis sirven para agrupar y para ___ lo que coincide.",
                  ["capturar"], "Los grupos `( )` agrupan y capturan; `(?: )` agrupa sin capturar.",
                  pista="Empieza con «cap»."),
            _orden("Ordena los pasos para construir una regex de fechas «dd/mm/aaaa».",
                   ["Escribir dos dígitos para el día: \\d{2}", "Agregar la barra: /",
                    "Escribir dos dígitos para el mes: \\d{2}", "Agregar otra barra: /",
                    "Escribir cuatro dígitos para el año: \\d{4}"],
                   "Se arma de izquierda a derecha siguiendo el formato: `\\d{2}/\\d{2}/\\d{4}`."),
            _vf("`\\b` coincide con un carácter de espacio.", False,
                "`\\b` es un límite de palabra: no consume ningún carácter.", dificultad=3),
        ]),
        ("Práctica libre", False, [
            _abierta("open", "Escribe una regex que valide un correo sencillo como «ana@ejemplo.com» "
                     "y explica cada parte.",
                     "^[\\w.+-]+@[\\w-]+\\.[a-z]{2,}$ : usuario, arroba, dominio, punto y extensión.",
                     "Una regex razonable: `^[\\w.+-]+@[\\w-]+\\.[a-z]{2,}$`. Validar correos al 100 % "
                     "con regex no es práctico; basta con descartar errores obvios.",
                     pista="Divide el correo en usuario, @, dominio y extensión."),
            _abierta("math_problem", "Sobre el alfabeto {a, b}, ¿cuántas cadenas de longitud 4 "
                     "coinciden completas con `a[ab]*b`? Justifica.",
                     "4: la primera es a, la última es b, y las dos del medio son libres: 2·2 = 4.",
                     "Fija la primera letra (a) y la última (b); las 2 posiciones del medio tienen 2 "
                     "opciones cada una: 2 × 2 = 4 cadenas (aaab, aabb, abab, abbb).",
                     pista="¿Cuántas posiciones quedan libres?"),
            _abierta("proof", "Demuestra que el lenguaje de `(ab)*` contiene solo cadenas de "
                     "longitud par.",
                     "Por inducción en el número de repeticiones k: la longitud es 2k.",
                     "Cada repetición de `(ab)` aporta exactamente 2 caracteres. Con k repeticiones "
                     "la longitud es 2k, que es par para todo k ≥ 0 (k = 0 da la cadena vacía, de "
                     "longitud 0). Formalmente, inducción sobre k.",
                     pista="¿Cuántos caracteres agrega cada repetición?"),
        ]),
    ]),
]


# Nivel final de cada sección (examen-aventura): se añade al cierre de la sección en el mismo
# orden que `CURSO`. Juega con estas preguntas propias más las de los demás niveles de la sección.
FINALES = [
    ("Nivel final: Lo básico", [
        _mc("¿Qué cadena coincide completa con `b.t`?",
            ["bat", "bt", "baat", "b.t literal solamente"], 0,
            "`.` es exactamente un carácter: «bat» tiene uno entre b y t.", dificultad=2),
        _vf("`[0-9]` y `\\d` describen (en ASCII) los mismos caracteres.", True,
            "Ambos son un dígito del 0 al 9.", dificultad=2),
        _fill("fill_code", "Completa para que coincida con un punto literal: `fin___`",
              ["\\."], "El punto sin escapar es comodín; `\\.` es un punto literal.", dificultad=3),
        _num("¿Cuántas coincidencias encuentra `o+` en «foo boo o»?", 3,
             "Bloques de «o» seguidas: «oo», «oo» y «o». Son tres.", dificultad=3),
        _mc("¿Qué significa `x*`?",
            ["Cero o más «x»", "Una o más «x»", "Exactamente una «x»", "Una «x» literal y un asterisco"],
            0, "`*` permite cero repeticiones; `+` exige al menos una.", dificultad=2),
        _vf("La regex `[^xyz]` coincide con la letra «y».", False,
            "`[^xyz]` acepta cualquier carácter salvo x, y o z.", dificultad=3),
        _mc("¿Qué devuelve `re.findall(r\"a.?\", \"abc\")`?",
            ["['ab']", "['a']", "['abc']", "['a', 'b', 'c']"], 0,
            "`a` seguida de cero o un carácter cualquiera; `?` es codicioso y toma la «b».",
            dificultad=4),
        _fill("fill_code", "Escribe la clase que acepta una vocal minúscula: `___`",
              ["[aeiou]"], "Una clase lista los caracteres válidos: `[aeiou]`.",
              dificultad=4),
    ]),
    ("Nivel final: Patrones con estructura", [
        _mc("¿Con qué coincide `^(sí|no)$`?",
            ["Solo con «sí» o con «no» completos", "Con cualquier texto que contenga «sí»",
             "Con «síno»", "Con «sí|no» literal"], 0,
            "Las anclas obligan a que toda la línea sea una de las alternativas.", dificultad=3),
        _vf("`(?:ab)+` agrupa sin crear un grupo de captura.", True,
            "`(?: )` es un grupo que no captura.", dificultad=3),
        _fill("fill_text", "El símbolo `|` en una regex significa ___ (una alternativa u otra).",
              ["o", "or"], "`|` es la alternancia: una cosa u otra.", dificultad=2),
        _num("¿Cuántos grupos de captura tiene `(\\d+)-(\\d+)-(?:\\d+)`?", 2,
             "Los dos primeros paréntesis capturan; `(?: )` no.", dificultad=4),
        _orden("Ordena las piezas de la regex de una hora «hh:mm».",
               ["Ancla de inicio: ^", "Dos dígitos para la hora: \\d{2}", "Dos puntos: :",
                "Dos dígitos para los minutos: \\d{2}", "Ancla de final: $"],
               "Queda `^\\d{2}:\\d{2}$`.", dificultad=3),
        _mc("¿Cuál de estas coincide con `\\bsol\\b`?",
            ["«el sol sale»", "«girasol»", "«soleado»", "«consola»"], 0,
            "`\\b` exige límite de palabra a ambos lados: solo «sol» suelto.", dificultad=4),
        _vf("`$` en `fin$` coincide con el símbolo de dólar literal.", False,
            "Sin escapar, `$` es el ancla de final de línea; el dólar literal es `\\$`.",
            dificultad=2),
    ]),
]


def crear_curso(db: Session, usuario_id: str) -> Curso:
    curso = Curso(usuario_id=usuario_id, titulo=TITULO, tema=TEMA, estado="publicado",
                  config={"repaso": "leitner", "origen": "ejemplo", "final_n": 8, "final_g": 70})
    todas: list[dict] = []
    for i, ((titulo_sec, niveles), fin) in enumerate(zip(CURSO, FINALES, strict=True)):
        seccion = Seccion(titulo=titulo_sec, orden=i)
        curso.secciones.append(seccion)
        todos = [(t, c, False, ps) for t, c, ps in niveles] + [(fin[0], False, True, fin[1])]
        for j, (titulo_niv, calentamiento, es_final, preguntas) in enumerate(todos):
            nivel = Nivel(titulo=titulo_niv, orden=j, es_calentamiento=calentamiento,
                          es_final=es_final)
            seccion.niveles.append(nivel)
            for k, datos in enumerate(preguntas):
                d = barajar(datos)
                d["tiempo_s"] = tiempo_por_defecto(d["tipo"], d["dificultad"], d["enunciado"])
                todas.append(d)
                nivel.preguntas.append(Pregunta(orden=k, **d))
    problemas = validar_lote(todas)
    malas = [(d["enunciado"][:50], p) for d, p in zip(todas, problemas, strict=True) if p]
    if malas:
        raise ValueError(f"El curso de ejemplo tiene preguntas inválidas: {malas}")
    for p in (p for s in curso.secciones for n in s.niveles for p in n.preguntas):
        p.valida, p.problemas = True, []
    db.add(curso)
    db.commit()
    return curso


def sembrar(db: Session, correo: str, reemplazar: bool = False) -> Curso:
    usuario = db.scalar(select(Usuario).where(Usuario.correo == correo.strip().lower()))
    if usuario is None:
        raise LookupError(f"No existe un usuario con el correo {correo}. Regístrate primero.")
    previo = db.scalars(select(Curso).where(Curso.usuario_id == usuario.id,
                                            Curso.titulo == TITULO)).all()
    if previo and not reemplazar:
        return previo[0]
    for c in previo:
        db.delete(c)
    db.commit()
    return crear_curso(db, usuario.id)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Carga el curso de ejemplo de regex para un usuario.")
    ap.add_argument("--correo", required=True)
    ap.add_argument("--reemplazar", action="store_true", help="borra y vuelve a crear el curso")
    args = ap.parse_args(argv)
    from app.core.db import SessionLocal

    with SessionLocal() as db:
        try:
            curso = sembrar(db, args.correo, args.reemplazar)
        except LookupError as e:
            print(e, file=sys.stderr)
            return 1
        n = sum(len(nv.preguntas) for s in curso.secciones for nv in s.niveles)
        print(f"Listo: «{curso.titulo}» con {len(curso.secciones)} secciones y {n} preguntas.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
