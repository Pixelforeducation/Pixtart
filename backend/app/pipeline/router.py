"""Endpoints «Cursos desde PDF» del contrato. Solo el dueño ve o edita su curso (404 si no)."""

import hashlib
import json
import logging

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.cursos import Curso, Documento, Pregunta, Trabajo, nuevo_id
from app.pipeline import servicio
from app.pipeline.dependencias import obtener_almacen, usuario_actual
from app.pipeline.esquemas import ConfigCurso, CuerpoRegenerar, EdicionPregunta
from app.pipeline import extraccion
from app.pipeline.extraccion import PDFInvalido, sanear_nombre, validar_pdf

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["cursos"])

_NO_ENCONTRADO = "No encontramos ese curso."


def _pregunta_json(p: Pregunta) -> dict:
    d = {"id": p.id, **servicio.pregunta_a_dict(p)}
    for opcional in ("opciones", "tolerancia", "pista", "fuente_pagina", "fuente_documento"):
        if d[opcional] is None:
            d.pop(opcional)
    d["tiempo_s"] = p.tiempo_s
    d["valida"] = p.valida
    d["problemas"] = list(p.problemas or [])
    return d


def _curso_json(c: Curso) -> dict:
    return {
        "id": c.id,
        "titulo": c.titulo,
        "tema": c.tema,
        "estado": c.estado,
        "secciones": [
            {
                "id": s.id,
                "titulo": s.titulo,
                "orden": s.orden,
                "niveles": [
                    {
                        "id": n.id,
                        "titulo": n.titulo,
                        "orden": n.orden,
                        "es_calentamiento": n.es_calentamiento,
                        "preguntas": [_pregunta_json(p) for p in n.preguntas],
                    }
                    for n in s.niveles
                ],
            }
            for s in c.secciones
        ],
    }


def _trabajo_json(t: Trabajo) -> dict:
    return {
        "id": t.id,
        "estado": t.estado,
        "progreso": t.progreso,
        "mensaje": t.mensaje,
        "error": t.error,
    }


def _curso_de(db: Session, usuario, curso_id: str) -> Curso:
    c = db.get(Curso, curso_id)
    if c is None or c.usuario_id != usuario.id:
        raise HTTPException(404, _NO_ENCONTRADO)
    return c


def _pregunta_de(db: Session, curso: Curso, pregunta_id: str) -> Pregunta:
    p = db.get(Pregunta, pregunta_id)
    if p is None or p.nivel.seccion.curso_id != curso.id:
        raise HTTPException(404, "No encontramos esa pregunta.")
    return p


def _trabajo_activo(db: Session, curso_id: str) -> Trabajo | None:
    return db.scalar(
        select(Trabajo).where(
            Trabajo.curso_id == curso_id, Trabajo.estado.in_(servicio.ESTADOS_ACTIVOS)
        )
    )


def _encolar(db: Session, t: Trabajo, tarea, *args) -> None:
    try:
        tarea.delay(*args)
    except Exception:  # broker caído
        log.exception("no se pudo encolar el trabajo %s", t.id)
        t.estado, t.error = "error", "No se pudo iniciar el procesamiento. Intenta más tarde."
        t.mensaje = t.error
        db.commit()


def _nombre_unico(nombre: str, usados: set[str]) -> str:
    """Dos archivos distintos con el mismo nombre: el segundo pasa a «x (2).pdf»."""
    if nombre.casefold() not in usados:
        return nombre
    raiz, ext = nombre[:-4], nombre[-4:]
    n = 2
    while f"{raiz} ({n}){ext}".casefold() in usados:
        n += 1
    return f"{raiz} ({n}){ext}"


def _leer_pdfs(archivos: list[UploadFile]) -> list[dict]:
    """Lee y valida los PDFs de la petición. Lanza 422 diciendo QUÉ archivo falló."""
    mb = 1024 * 1024
    if not archivos:
        raise HTTPException(422, "Sube al menos un PDF.")
    if len(archivos) > extraccion.MAX_ARCHIVOS:
        raise HTTPException(
            422,
            f"Subiste {len(archivos)} archivos; el máximo es {extraccion.MAX_ARCHIVOS} PDFs.",
        )
    leidos: list[dict] = []
    usados: set[str] = set()
    total = 0
    for archivo in archivos:
        original = sanear_nombre(archivo.filename)
        datos = archivo.file.read(extraccion.MAX_BYTES + 1)
        total += len(datos)
        if len(datos) <= extraccion.MAX_BYTES and total > extraccion.MAX_BYTES_TOTAL:
            raise HTTPException(
                422,
                f"Entre todos los PDFs superan el máximo total de "
                f"{extraccion.MAX_BYTES_TOTAL // mb} MB (al llegar a «{original}»).",
            )
        try:
            paginas = validar_pdf(datos)
        except PDFInvalido as e:
            raise HTTPException(422, f"«{original}»: {e}") from e
        sha = hashlib.sha256(datos).hexdigest()
        igual = next((x for x in leidos if x["sha256"] == sha), None)
        if igual is not None:
            raise HTTPException(
                422,
                f"«{original}» es idéntico a «{igual['nombre']}»; quita uno de los dos.",
            )
        nombre = _nombre_unico(original, usados)
        usados.add(nombre.casefold())
        leidos.append({"nombre": nombre, "datos": datos, "sha256": sha, "paginas": paginas})
    paginas_total = sum(x["paginas"] for x in leidos)
    if paginas_total > extraccion.MAX_PAGINAS_TOTAL:
        detalle = ", ".join(f"«{x['nombre']}» {x['paginas']}" for x in leidos)
        raise HTTPException(
            422,
            f"Entre todos los PDFs suman {paginas_total} páginas ({detalle}); "
            f"el máximo total es {extraccion.MAX_PAGINAS_TOTAL}.",
        )
    return leidos


@router.post("/cursos", status_code=202)
def crear_curso(
    pdf: list[UploadFile] = File(...),
    config: str = Form(...),
    usuario=Depends(usuario_actual),
    db: Session = Depends(get_db),
    almacen=Depends(obtener_almacen),
):
    try:
        cfg = ConfigCurso.model_validate(json.loads(config))
    except (json.JSONDecodeError, ValidationError) as e:
        detalle = "; ".join(
            f"{'.'.join(map(str, err['loc']))}: {err['msg']}" for err in e.errors()
        ) if isinstance(e, ValidationError) else "no es JSON válido"
        raise HTTPException(422, f"La configuración no es válida: {detalle}") from e

    leidos = _leer_pdfs(pdf)

    config_dict = cfg.model_dump()
    primero = leidos[0]["nombre"]
    titulo = cfg.titulo or primero.rsplit(".", 1)[0][:200] or "Curso"
    curso = Curso(usuario_id=usuario.id, titulo=titulo, config=config_dict)
    db.add(curso)
    db.flush()
    recibido = "PDF recibido." if len(leidos) == 1 else f"{len(leidos)} PDFs recibidos."
    t = Trabajo(usuario_id=usuario.id, curso_id=curso.id, tipo="generar", mensaje=recibido)
    db.add(t)
    db.flush()
    rutas: list[str] = []
    try:
        for orden, x in enumerate(leidos):
            doc_id = nuevo_id()
            ruta = f"{usuario.id}/{doc_id}.pdf"
            almacen.guardar(ruta, x["datos"])
            rutas.append(ruta)
            db.add(
                Documento(
                    id=doc_id,
                    usuario_id=usuario.id,
                    curso_id=curso.id,
                    trabajo_id=t.id,
                    orden=orden,
                    nombre=x["nombre"],
                    sha256=x["sha256"],
                    tamano=len(x["datos"]),
                    paginas=x["paginas"],
                    ruta=ruta,
                )
            )
        db.commit()
    except Exception:
        db.rollback()
        for ruta in rutas:
            almacen.borrar(ruta)
        raise

    from app.pipeline.tasks import procesar_curso

    _encolar(db, t, procesar_curso, t.id)
    if t.estado == "error":  # no se encoló: no dejar los PDFs en el almacén
        servicio.borrar_documentos(db, t, servicio.documentos_del_trabajo(db, t), almacen)
    return {"curso_id": curso.id, "trabajo_id": t.id}


@router.get("/trabajos/{trabajo_id}")
def ver_trabajo(trabajo_id: str, usuario=Depends(usuario_actual), db: Session = Depends(get_db)):
    t = db.get(Trabajo, trabajo_id)
    if t is None or t.usuario_id != usuario.id:
        raise HTTPException(404, "No encontramos ese trabajo.")
    return _trabajo_json(t)


@router.get("/cursos")
def listar_cursos(usuario=Depends(usuario_actual), db: Session = Depends(get_db)):
    cursos = db.scalars(
        select(Curso).where(Curso.usuario_id == usuario.id).order_by(Curso.created_at.desc())
    )
    return [
        {
            "id": c.id,
            "titulo": c.titulo,
            "estado": c.estado,
            "tema": c.tema,
            "creado": c.created_at.isoformat() if c.created_at else None,
        }
        for c in cursos
    ]


@router.get("/cursos/{curso_id}")
def ver_curso(curso_id: str, usuario=Depends(usuario_actual), db: Session = Depends(get_db)):
    return _curso_json(_curso_de(db, usuario, curso_id))


@router.patch("/cursos/{curso_id}/preguntas/{pregunta_id}")
def editar_pregunta(
    curso_id: str,
    pregunta_id: str,
    cambios: EdicionPregunta,
    usuario=Depends(usuario_actual),
    db: Session = Depends(get_db),
):
    curso = _curso_de(db, usuario, curso_id)
    p = _pregunta_de(db, curso, pregunta_id)
    campos = cambios.model_dump(exclude_unset=True)
    for obligatorio in ("tipo", "enunciado", "explicacion", "dificultad", "tiempo_s"):
        if obligatorio in campos and campos[obligatorio] is None:
            raise HTTPException(422, f"El campo {obligatorio} no puede ser nulo.")
    for k, v in campos.items():
        setattr(p, k, v)
    if "tiempo_s" in campos:
        p.tiempo_manual = True
    db.commit()
    servicio.validar_curso(db, curso)
    if curso.estado == "publicado" and not p.valida:
        curso.estado = "borrador"
        db.commit()
    return _pregunta_json(p)


@router.delete("/cursos/{curso_id}/preguntas/{pregunta_id}", status_code=204)
def borrar_pregunta(
    curso_id: str,
    pregunta_id: str,
    usuario=Depends(usuario_actual),
    db: Session = Depends(get_db),
):
    curso = _curso_de(db, usuario, curso_id)
    p = _pregunta_de(db, curso, pregunta_id)
    p.nivel.preguntas.remove(p)
    db.commit()
    servicio.validar_curso(db, curso)
    return Response(status_code=204)


@router.post("/cursos/{curso_id}/preguntas/{pregunta_id}/regenerar", status_code=202)
def regenerar(
    curso_id: str,
    pregunta_id: str,
    cuerpo: CuerpoRegenerar | None = Body(default=None),
    usuario=Depends(usuario_actual),
    db: Session = Depends(get_db),
):
    curso = _curso_de(db, usuario, curso_id)
    p = _pregunta_de(db, curso, pregunta_id)
    if _trabajo_activo(db, curso.id):
        raise HTTPException(409, "Este curso tiene un trabajo en curso; espera a que termine.")
    instruccion = cuerpo.instruccion if cuerpo else None
    t = Trabajo(
        usuario_id=usuario.id,
        curso_id=curso.id,
        tipo="regenerar",
        estado="generando",
        mensaje="En cola.",
        datos={"pregunta_id": p.id, "instruccion": instruccion},
    )
    db.add(t)
    db.commit()

    from app.pipeline.tasks import regenerar_pregunta

    _encolar(db, t, regenerar_pregunta, t.id, p.id, instruccion)
    return {"trabajo_id": t.id}


@router.post("/cursos/{curso_id}/publicar")
def publicar(curso_id: str, usuario=Depends(usuario_actual), db: Session = Depends(get_db)):
    curso = _curso_de(db, usuario, curso_id)
    if _trabajo_activo(db, curso.id):
        raise HTTPException(409, "El curso todavía se está generando.")
    preguntas = servicio.preguntas_del_curso(curso)
    if not preguntas:
        raise HTTPException(409, "El curso no tiene preguntas.")
    invalidas = servicio.validar_curso(db, curso)
    if invalidas:
        raise HTTPException(
            409, f"Hay {invalidas} pregunta(s) que no pasan la validación; corrígelas o bórralas."
        )
    curso.estado = "publicado"
    db.commit()
    return {"id": curso.id, "estado": "publicado"}
