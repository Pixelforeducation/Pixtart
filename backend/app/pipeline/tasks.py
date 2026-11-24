"""Tareas Celery del pipeline. La lógica vive en servicio.py."""

from app.core.celery_app import celery
from app.pipeline import servicio
from app.pipeline.dependencias import servicios


@celery.task(name="pipeline.procesar_curso")
def procesar_curso(trabajo_id: str) -> None:
    with servicios.sesion() as db:
        servicio.procesar_curso(db, trabajo_id)


@celery.task(name="pipeline.regenerar_pregunta")
def regenerar_pregunta(trabajo_id: str, pregunta_id: str, instruccion: str | None = None) -> None:
    with servicios.sesion() as db:
        servicio.regenerar_pregunta(db, trabajo_id, pregunta_id, instruccion)
