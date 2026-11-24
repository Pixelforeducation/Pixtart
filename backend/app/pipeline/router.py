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
from app.pipeline.extraccion import MAX_BYTES, PDFInvalido, validar_pdf

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["cursos"])

_NO_ENCONTRADO = "No encontramos ese curso."


def _pregunta_json(p: Pregunta) -> dict:
    d = {"id": p.id, **servicio.pregunta_a_dict(p)}
    for opcional in ("opciones", "tolerancia", "pista", "fuente_pagina"):
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


@router.post("/cursos", status_code=202)
def crear_curso(
    pdf: UploadFile = File(...),
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

    datos = pdf.file.read(MAX_BYTES + 1)
    try:
        paginas = validar_pdf(datos)
    except PDFInvalido as e:
        raise HTTPException(422, str(e)) from e

    config_dict = cfg.model_dump()
    nombre = (pdf.filename or "documento.pdf")[:255]
    titulo = cfg.titulo or nombre.rsplit(".", 1)[0][:200] or "Curso"
    curso = Curso(usuario_id=usuario.id, titulo=titulo, config=config_dict)
    db.add(curso)
    db.flush()
    doc_id = nuevo_id()
    ruta = f"{usuario.id}/{doc_id}.pdf"
    almacen.guardar(ruta, datos)
    db.add(
        Documento(
            id=doc_id,
            usuario_id=usuario.id,
            curso_id=curso.id,
            nombre=nombre,
            sha256=hashlib.sha256(datos).hexdigest(),
            tamano=len(datos),
            paginas=paginas,
            ruta=ruta,
        )
    )
    t = Trabajo(
        usuario_id=usuario.id, curso_id=curso.id, tipo="generar", mensaje="PDF recibido."
    )
    db.add(t)
    db.commit()

    from app.pipeline.tasks import procesar_curso

    _encolar(db, t, procesar_curso, t.id)
    if t.estado == "error":  # no se encoló: no dejar el PDF en el almacén
        almacen.borrar(ruta)
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
