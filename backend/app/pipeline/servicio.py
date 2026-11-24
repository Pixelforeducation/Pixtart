"""Lógica del pipeline (sin Celery, para poder probarla directamente).

Estados: subiendo → leyendo → ocr → analizando → generando → validando → listo | error.
Idempotencia: la estructura se guarda como checkpoint en `Trabajo.datos`, las secciones se crean
una sola vez y un nivel que ya tiene preguntas no se vuelve a generar; un trabajo en `listo` o
`error` no se reprocesa. Los PDFs (uno o varios `Documento` del trabajo) se borran todos al
terminar (éxito o error). Cada PDF se lee y pasa por OCR por separado; los fragmentos conservan
(documento, página) y nunca mezclan documentos.
"""

import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.llm.base import ClienteLLM, ErrorLLM, Uso
from app.models.cursos import Curso, Documento, Nivel, Pregunta, Seccion, Trabajo
from app.pipeline import prompts
from app.pipeline.barajado import barajar
from app.pipeline.dependencias import clases_limite, mensaje_limite, servicios
from app.pipeline.extraccion import aplicar_ocr, extraer_texto, paginas_escaneadas
from app.pipeline.fragmentos import dividir, fragmentos_en_rango
from app.pipeline.validacion import tiempo_por_defecto, validar_lote

log = logging.getLogger(__name__)

MSG_SIN_KEY = "Conecta tu API key de Anthropic para generar cursos"
MSG_INTERNO = "Ocurrió un error interno al generar el curso. Intenta de nuevo."
TOKENS_CONTEXTO_NIVEL = 24000
ESTADOS_ACTIVOS = ("subiendo", "leyendo", "ocr", "analizando", "generando", "validando")
CAMPOS_PREGUNTA = (
    "tipo",
    "enunciado",
    "opciones",
    "respuesta",
    "tolerancia",
    "explicacion",
    "pista",
    "dificultad",
    "fuente_pagina",
    "fuente_documento",
)


class ErrorPipeline(Exception):
    def __init__(self, mensaje: str):
        super().__init__(mensaje)
        self.mensaje = mensaje


def _estado(db: Session, t: Trabajo, estado: str, progreso: int, mensaje: str) -> None:
    t.estado, t.progreso, t.mensaje = estado, progreso, mensaje
    db.commit()


def _fallar(db: Session, t: Trabajo, mensaje: str) -> None:
    db.rollback()
    t.estado, t.error, t.mensaje = "error", mensaje, mensaje
    db.commit()


def _cliente(db: Session, usuario_id: str) -> ClienteLLM:
    key = servicios.obtener_key(db, usuario_id)
    if not key:
        raise ErrorPipeline(MSG_SIN_KEY)
    return servicios.fabrica_llm(key, servicios.obtener_modelo(db, usuario_id))


def _registrar(db: Session, t: Trabajo, uso: Uso) -> None:
    t.tokens_entrada += uso.tokens_entrada
    t.tokens_salida += uso.tokens_salida
    db.commit()
    if uso.tokens_entrada or uso.tokens_salida:
        servicios.registrar_uso(db, t.usuario_id, uso.tokens_entrada, uso.tokens_salida)


def _llamar(db: Session, t: Trabajo, llm: ClienteLLM, mensajes: list[dict], esquema: dict):
    servicios.verificar_limite(db, t.usuario_id)
    try:
        datos, uso = llm.generar_json(prompts.SISTEMA, mensajes, esquema, max_tokens=16000)
    except ErrorLLM as e:
        _registrar(db, t, e.uso)
        raise
    _registrar(db, t, uso)
    return datos


def _ejecutar(db: Session, t: Trabajo, cuerpo) -> None:
    """Corre `cuerpo()` traduciendo errores a un estado `error` con mensaje claro."""
    limites = clases_limite()
    try:
        cuerpo()
    except ErrorPipeline as e:
        _fallar(db, t, e.mensaje)
    except limites as e:
        _fallar(db, t, mensaje_limite(e))
    except ErrorLLM as e:
        _fallar(db, t, e.mensaje_usuario)
        if e.key_rechazada:
            servicios.marcar_key_invalida(db, t.usuario_id)
    except Exception:
        log.exception("fallo procesando el trabajo %s", t.id)
        _fallar(db, t, MSG_INTERNO)


# ---------------- estructura ----------------

def normalizar_estructura(
    estructura: dict, max_niveles: int, documentos: list[str] | None = None
) -> dict:
    """Garantiza un calentamiento al inicio de cada sección (y solo ahí), acota niveles y cierra
    cada sección con un nivel final (examen-aventura; no cuenta para `max_niveles` y no se le
    generan preguntas: usa las de los demás niveles de su sección).
    Con `documentos` (nombres válidos), el `documento` de cada nivel se valida: si no es uno
    de ellos queda None; con un solo documento, todos los niveles son de ese."""
    secciones = []
    restantes = max_niveles
    for s in estructura.get("secciones", []):
        niveles = [dict(n) for n in s.get("niveles", []) if not n.get("es_final")]
        if documentos is not None:
            for n in niveles:
                n["documento"] = resolver_documento(n.get("documento"), documentos)
        if not niveles or restantes <= 0:
            continue
        calent = next((n for n in niveles if n.get("es_calentamiento")), None)
        if calent is None:
            primero = niveles[0]
            calent = {
                "titulo": f"Calentamiento: {s['titulo']}"[:200],
                "resumen": " ".join(n.get("resumen", "") for n in niveles)[:3000],
                "pagina_inicio": primero.get("pagina_inicio"),
                "pagina_fin": niveles[-1].get("pagina_fin"),
            }
            docs = {n.get("documento") for n in niveles}
            if len(docs) == 1 and None not in docs:
                calent["documento"] = docs.pop()
        else:
            niveles.remove(calent)
        calent["es_calentamiento"] = True
        for n in niveles:
            n["es_calentamiento"] = False
        for n in niveles:
            n["es_final"] = False
        calent["es_final"] = False
        lista = ([calent] + niveles)[:restantes]
        restantes -= len(lista)
        lista.append(_nivel_final(s["titulo"], lista))
        secciones.append({"titulo": s["titulo"], "niveles": lista})
    if not secciones:
        raise ErrorPipeline("La IA no pudo proponer una estructura para este PDF.")
    return {
        "titulo": estructura.get("titulo") or "Curso",
        "tema": estructura.get("tema") or "",
        "secciones": secciones,
    }


def _nivel_final(titulo_seccion: str, niveles: list[dict]) -> dict:
    final = {
        "titulo": f"Nivel final: {titulo_seccion}"[:200],
        "resumen": "",
        "pagina_inicio": niveles[0].get("pagina_inicio") if niveles else None,
        "pagina_fin": niveles[-1].get("pagina_fin") if niveles else None,
        "es_calentamiento": False,
        "es_final": True,
    }
    docs = {n.get("documento") for n in niveles}
    if len(docs) == 1 and None not in docs:
        final["documento"] = docs.pop()
    return final


def resolver_documento(nombre: str | None, documentos: list[str]) -> str | None:
    """`nombre` si es uno de `documentos` (tolerando mayúsculas/espacios); con un solo
    documento, ese; si no, None."""
    if nombre:
        clave = nombre.strip().casefold()
        for d in documentos:
            if d.casefold() == clave:
                return d
    if len(documentos) == 1:
        return documentos[0]
    return None


def repartir(pesos: list[float], total: int) -> list[int]:
    """Reparte `total` en enteros ≥ 1 proporcionales a `pesos` (mayor resto, determinista)."""
    n = len(pesos)
    if n == 0:
        return []
    base = [1] * n
    libres = total - n
    if libres <= 0:
        return base
    suma = sum(pesos)
    cuotas = [libres * p / suma for p in pesos]
    enteros = [int(c) for c in cuotas]
    sobran = libres - sum(enteros)
    orden = sorted(range(n), key=lambda i: (-(cuotas[i] - enteros[i]), i))
    for i in orden[:sobran]:
        enteros[i] += 1
    return [b + e for b, e in zip(base, enteros, strict=True)]


def _crear_secciones(db: Session, curso: Curso, estructura: dict) -> None:
    for i, s in enumerate(estructura["secciones"]):
        sec = Seccion(titulo=s["titulo"][:200], orden=i)
        for j, n in enumerate(s["niveles"]):
            sec.niveles.append(
                Nivel(
                    titulo=n["titulo"][:200],
                    orden=j,
                    es_calentamiento=bool(n["es_calentamiento"]),
                    es_final=bool(n.get("es_final")),
                    resumen=n.get("resumen", ""),
                    pagina_inicio=n.get("pagina_inicio"),
                    pagina_fin=n.get("pagina_fin"),
                    documento=n.get("documento"),
                )
            )
        curso.secciones.append(sec)
    if not curso.config.get("titulo"):
        curso.titulo = estructura["titulo"][:200]
    curso.tema = (estructura.get("tema") or "")[:200]
    db.commit()


def _pregunta_desde(
    d: dict, orden: int, documentos: list[str] | None = None, por_defecto: str | None = None
) -> Pregunta:
    datos = {k: d.get(k) for k in CAMPOS_PREGUNTA}
    if documentos is not None:
        datos["fuente_documento"] = (
            resolver_documento(datos.get("fuente_documento"), documentos) or por_defecto
        )
    datos = barajar(datos)
    datos["explicacion"] = datos["explicacion"] or ""
    datos["enunciado"] = datos["enunciado"] or ""
    return Pregunta(orden=orden, **datos)


# ---------------- validación ----------------

def pregunta_a_dict(p: Pregunta) -> dict:
    return {k: getattr(p, k) for k in CAMPOS_PREGUNTA}


def preguntas_del_curso(curso: Curso) -> list[Pregunta]:
    return [p for s in curso.secciones for n in s.niveles for p in n.preguntas]


def validar_curso(db: Session, curso: Curso) -> int:
    """Revalida todas las preguntas (incluye duplicados entre niveles) y recalcula tiempos
    no fijados a mano. Devuelve cuántas son inválidas."""
    preguntas = preguntas_del_curso(curso)
    tiempos = curso.config.get("tiempos_por_tipo")
    lote = validar_lote([pregunta_a_dict(p) for p in preguntas], curso.config.get("tipos"))
    invalidas = 0
    for p, probs in zip(preguntas, lote, strict=True):
        p.problemas = probs
        p.valida = not probs
        invalidas += bool(probs)
        if not p.tiempo_manual:
            p.tiempo_s = tiempo_por_defecto(p.tipo, p.dificultad, p.enunciado, tiempos)
    db.commit()
    return invalidas


# ---------------- tareas ----------------

def documentos_del_trabajo(db: Session, t: Trabajo) -> list[Documento]:
    docs = db.scalars(
        select(Documento).where(Documento.trabajo_id == t.id).order_by(Documento.orden)
    ).all()
    if docs:
        return list(docs)
    # filas anteriores a los envíos múltiples: un Documento por curso, sin trabajo_id
    doc = db.scalar(
        select(Documento)
        .where(Documento.curso_id == t.curso_id, Documento.trabajo_id.is_(None))
        .order_by(Documento.created_at.desc())
    )
    return [doc] if doc else []


def borrar_documentos(db: Session, t: Trabajo, docs: list[Documento], almacen) -> None:
    for doc in docs:
        if doc.borrado_en is not None:
            continue
        try:
            almacen.borrar(doc.ruta)
        except Exception:  # noqa: BLE001
            log.exception("no se pudo borrar un PDF del trabajo %s", t.id)
        else:
            doc.borrado_en = datetime.now(UTC)
    db.commit()


def procesar_curso(db: Session, trabajo_id: str) -> None:
    t = db.get(Trabajo, trabajo_id)
    if t is None or t.estado in ("listo", "error"):
        return
    curso = db.get(Curso, t.curso_id)
    docs = documentos_del_trabajo(db, t)
    almacen = servicios.almacen()
    avisos: list[str] = []

    def cuerpo() -> None:
        llm = _cliente(db, t.usuario_id)
        config = curso.config
        if not docs or any(d.borrado_en is not None for d in docs):
            raise ErrorPipeline("El PDF ya no está disponible; súbelo de nuevo.")
        nombres = [d.nombre for d in docs]
        varios = len(docs) > 1
        fragmentos = []
        sin_texto = []
        for i, doc in enumerate(docs):
            cuenta = f" ({i + 1} de {len(docs)})" if varios else ""
            base = 5 + int(15 * i / len(docs))
            _estado(db, t, "leyendo", base, f"Leyendo {doc.nombre}{cuenta}…")
            try:
                datos = almacen.leer(doc.ruta)
            except FileNotFoundError as e:
                raise ErrorPipeline(
                    f"El PDF «{doc.nombre}» ya no está disponible; súbelo de nuevo."
                ) from e
            paginas = extraer_texto(datos)
            if paginas_escaneadas(paginas):
                _estado(
                    db, t, "ocr", base + 1,
                    f"Reconociendo texto de páginas escaneadas de {doc.nombre}{cuenta}…",
                )
                for aviso in aplicar_ocr(datos, paginas, servicios.obtener_ocr()):
                    avisos.append(f"{doc.nombre}: {aviso}" if varios else aviso)
            del datos
            propios = dividir(paginas, documento=doc.nombre)
            if not propios:
                sin_texto.append(doc.nombre)
            fragmentos.extend(propios)
        if not fragmentos:
            raise ErrorPipeline(
                "No se encontró texto en el PDF (¿está escaneado y sin OCR disponible?)."
                if not varios
                else "No se encontró texto en ninguno de los PDFs "
                "(¿están escaneados y sin OCR disponible?)."
            )
        if sin_texto:
            avisos.append(f"Sin texto legible, se omitió: {', '.join(sin_texto)}.")

        _estado(db, t, "analizando", 25, "Organizando el curso en secciones y niveles…")
        max_niveles = max(2, config["num_preguntas"] // 3)
        estructura = (t.datos or {}).get("estructura")
        if estructura is None:
            bruta = _llamar(
                db,
                t,
                llm,
                prompts.mensajes_estructura(
                    prompts.agrupar_fragmentos(fragmentos), config, max_niveles
                ),
                prompts.ESQUEMA_ESTRUCTURA,
            )
            estructura = normalizar_estructura(bruta, max_niveles, nombres)
            t.datos = {**(t.datos or {}), "estructura": estructura}
            db.commit()
        if not curso.secciones:
            _crear_secciones(db, curso, estructura)

        # El nivel final no se genera: juega con las preguntas de su sección.
        niveles = [(s, n) for s in curso.secciones for n in s.niveles if not n.es_final]
        cuotas = repartir(
            [0.5 if n.es_calentamiento else 1.0 for _, n in niveles], config["num_preguntas"]
        )
        hechas = [p.enunciado for _, n in niveles for p in n.preguntas]
        for i, ((sec, nivel), cuota) in enumerate(zip(niveles, cuotas, strict=True)):
            progreso = 35 + int(50 * i / len(niveles))
            _estado(db, t, "generando", progreso, f"Generando preguntas: {nivel.titulo}")
            if nivel.preguntas:  # checkpoint: ya generado en un intento anterior
                continue
            contexto = fragmentos_en_rango(
                fragmentos,
                nivel.pagina_inicio,
                nivel.pagina_fin,
                TOKENS_CONTEXTO_NIVEL,
                nivel.documento,
            )
            dificultad = config["dificultad"]
            if nivel.es_calentamiento:
                dificultad = max(1, dificultad - 1)
            resp = _llamar(
                db,
                t,
                llm,
                prompts.mensajes_preguntas(
                    prompts.agrupar_fragmentos(contexto),
                    config,
                    sec.titulo,
                    nivel.titulo,
                    nivel.resumen,
                    cuota,
                    dificultad,
                    nivel.es_calentamiento,
                    hechas,
                    nivel.documento,
                ),
                prompts.ESQUEMA_PREGUNTAS,
            )
            en_contexto = list(dict.fromkeys(f.documento for f in contexto))
            por_defecto = nivel.documento or (en_contexto[0] if len(en_contexto) == 1 else None)
            for orden, d in enumerate(resp["preguntas"][:cuota]):
                nivel.preguntas.append(_pregunta_desde(d, orden, nombres, por_defecto))
                hechas.append(d.get("enunciado") or "")
            db.commit()

        _estado(db, t, "validando", 90, "Revisando las preguntas…")
        invalidas = validar_curso(db, curso)
        mensaje = "Curso listo."
        if invalidas:
            mensaje += f" {invalidas} pregunta(s) necesitan revisión."
        if avisos:
            mensaje += " " + " ".join(avisos)
        _estado(db, t, "listo", 100, mensaje)

    try:
        _ejecutar(db, t, cuerpo)
    finally:
        # Se borran al terminar (listo o error). Si el worker muere a mitad (estado activo),
        # se conservan para que el reintento de Celery (acks_late) pueda continuar.
        if t.estado in ("listo", "error"):
            borrar_documentos(db, t, docs, almacen)


def regenerar_pregunta(
    db: Session, trabajo_id: str, pregunta_id: str, instruccion: str | None
) -> None:
    t = db.get(Trabajo, trabajo_id)
    if t is None or t.estado in ("listo", "error"):
        return

    def cuerpo() -> None:
        p = db.get(Pregunta, pregunta_id)
        if p is None or p.nivel.seccion.curso_id != t.curso_id:
            raise ErrorPipeline("La pregunta ya no existe.")
        llm = _cliente(db, t.usuario_id)
        curso = p.nivel.seccion.curso
        _estado(db, t, "generando", 30, "Generando una nueva versión de la pregunta…")
        nivel = p.nivel
        contexto = f"Sección: {nivel.seccion.titulo}\nNivel: {nivel.titulo}\n{nivel.resumen}"
        if nivel.documento:
            contexto = f"Documento: {nivel.documento}\n{contexto}"
        nombres = [
            d.nombre
            for d in db.scalars(
                select(Documento)
                .where(Documento.curso_id == curso.id)
                .order_by(Documento.created_at, Documento.orden)
            )
        ]
        otras = [q.enunciado for q in preguntas_del_curso(curso) if q.id != p.id]
        resp = _llamar(
            db,
            t,
            llm,
            prompts.mensajes_regenerar(
                curso.config, contexto, pregunta_a_dict(p), instruccion, otras
            ),
            prompts.ESQUEMA_PREGUNTA_UNICA,
        )
        nueva = _pregunta_desde(
            resp["pregunta"], p.orden, nombres or None, nivel.documento or p.fuente_documento
        )
        for k in CAMPOS_PREGUNTA:
            setattr(p, k, getattr(nueva, k))
        p.tiempo_manual = False
        db.commit()
        _estado(db, t, "validando", 80, "Revisando la pregunta…")
        validar_curso(db, curso)
        if curso.estado == "publicado" and not p.valida:
            curso.estado = "borrador"
        _estado(db, t, "listo", 100, "Pregunta regenerada.")

    _ejecutar(db, t, cuerpo)
