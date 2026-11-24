"""Aplicación Celery. Las tareas viven en app/pipeline/tasks.py (agente pipeline)."""

from celery import Celery

from app.core.config import get_settings

_s = get_settings()
celery = Celery("pixtart", broker=_s.valkey_url, backend=_s.valkey_url)
celery.conf.task_always_eager = _s.celery_eager
celery.conf.task_acks_late = True
celery.autodiscover_tasks(["app.pipeline"])
