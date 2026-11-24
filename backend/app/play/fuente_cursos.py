"""Acceso de solo lectura a los cursos publicados (adaptador sobre `app.models.cursos`).

El juego no conoce las tablas del pipeline: habla con `FuenteCursos`. Hay dos implementaciones:
- `FuenteCursosMemoria`: para tests.
- `FuenteCursosSQL`: importa `app.models.cursos` de forma perezosa. Supone los nombres del
  contrato: `Curso(id, titulo, tema, estado, usuario_id, config?)`, `Seccion(id, curso_id, titulo,
  orden)`, `Nivel(id, seccion_id, titulo, orden, es_calentamiento)` y `Pregunta(id, nivel_id,
  tipo, enunciado, opciones, respuesta, tolerancia, explicacion, pista, dificultad, tiempo_s,
  valida)`. Atributos opcionales que se leen con `getattr`: `Curso.config` (dict con
  `tiempos_por_tipo` y `repaso`), `Nivel.es_final`, `Nivel.es_jefe`.

Todo método recibe `usuario_id` y devuelve None si el curso no existe, no es del usuario o no
está publicado (la API responde 404).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from sqlalchemy.orm import Session

from app.game.tipos import Pregunta


@dataclass(frozen=True, slots=True)
class NivelInfo:
    id: str
    titulo: str
    orden: int
    es_calentamiento: bool = False
    es_final: bool = False
    es_jefe: bool = False


@dataclass(frozen=True, slots=True)
class SeccionInfo:
    id: str
    titulo: str
    orden: int
    niveles: tuple[NivelInfo, ...] = ()


@dataclass(frozen=True, slots=True)
class CaminoCurso:
    id: str
    titulo: str
    tema: str
    secciones: tuple[SeccionInfo, ...] = ()
    tiempos_por_tipo: dict[str, float] = field(default_factory=dict)
    repaso: str = "leitner"

    def niveles(self) -> list[tuple[SeccionInfo, NivelInfo]]:
        """Niveles en orden de juego (sección, nivel)."""
        return [
            (s, n)
            for s in sorted(self.secciones, key=lambda s: s.orden)
            for n in sorted(s.niveles, key=lambda n: n.orden)
        ]


@dataclass(frozen=True, slots=True)
class PreguntaFuente:
    """La `Pregunta` de las reglas más lo que el juego necesita mostrar después."""

    pregunta: Pregunta
    explicacion: str = ""
    tiempo_s: int | None = None


class FuenteCursos(Protocol):
    def camino(self, db: Session, usuario_id: str, curso_id: str) -> CaminoCurso | None: ...

    def curso_de_nivel(self, db: Session, usuario_id: str, nivel_id: str) -> CaminoCurso | None:
        ...

    def preguntas(self, db: Session, usuario_id: str, nivel_id: str) -> list[PreguntaFuente]:
        """Preguntas válidas del nivel (vacío si el nivel no es accesible)."""
        ...


# ---------------------------------------------------------------- memoria


@dataclass
class CursoMemoria:
    camino: CaminoCurso
    usuario_id: str
    publicado: bool = True
    preguntas: dict[str, list[PreguntaFuente]] = field(default_factory=dict)  # nivel_id → lista


class FuenteCursosMemoria:
    def __init__(self, cursos: list[CursoMemoria] | None = None):
        self.cursos: dict[str, CursoMemoria] = {c.camino.id: c for c in cursos or []}

    def agregar(self, curso: CursoMemoria) -> None:
        self.cursos[curso.camino.id] = curso

    def _visible(self, usuario_id: str, curso_id: str) -> CursoMemoria | None:
        c = self.cursos.get(curso_id)
        if c is None or c.usuario_id != usuario_id or not c.publicado:
            return None
        return c

    def camino(self, db: Session, usuario_id: str, curso_id: str) -> CaminoCurso | None:
        c = self._visible(usuario_id, curso_id)
        return c.camino if c else None

    def curso_de_nivel(self, db: Session, usuario_id: str, nivel_id: str) -> CaminoCurso | None:
        for c in self.cursos.values():
            if any(n.id == nivel_id for _, n in c.camino.niveles()):
                return self.camino(db, usuario_id, c.camino.id)
        return None

    def preguntas(self, db: Session, usuario_id: str, nivel_id: str) -> list[PreguntaFuente]:
        camino = self.curso_de_nivel(db, usuario_id, nivel_id)
        if camino is None:
            return []
        return list(self.cursos[camino.id].preguntas.get(nivel_id, []))


# ---------------------------------------------------------------- SQL


class FuenteCursosSQL:
    """Lee las tablas del pipeline. El import es perezoso para no depender de ellas al cargar."""

    @staticmethod
    def _m() -> Any:
        from app.models import cursos  # noqa: PLC0415  (módulo del agente pipeline)

        return cursos

    def _curso(self, db: Session, usuario_id: str, curso_id: str) -> Any | None:
        m = self._m()
        curso = db.get(m.Curso, curso_id)
        if curso is None or str(curso.usuario_id) != str(usuario_id):
            return None
        if getattr(curso, "estado", None) != "publicado":
            return None
        return curso

    def camino(self, db: Session, usuario_id: str, curso_id: str) -> CaminoCurso | None:
        curso = self._curso(db, usuario_id, curso_id)
        if curso is None:
            return None
        m = self._m()
        secciones = []
        for s in db.query(m.Seccion).filter(m.Seccion.curso_id == curso.id).all():
            niveles = tuple(
                NivelInfo(
                    id=str(n.id),
                    titulo=n.titulo,
                    orden=int(n.orden),
                    es_calentamiento=bool(n.es_calentamiento),
                    es_final=bool(getattr(n, "es_final", False)),
                    es_jefe=bool(getattr(n, "es_jefe", False)),
                )
                for n in db.query(m.Nivel).filter(m.Nivel.seccion_id == s.id).all()
            )
            secciones.append(SeccionInfo(str(s.id), s.titulo, int(s.orden), niveles))
        config = getattr(curso, "config", None) or {}
        return CaminoCurso(
            id=str(curso.id),
            titulo=curso.titulo,
            tema=curso.tema or curso.titulo,
            secciones=tuple(secciones),
            tiempos_por_tipo=dict(config.get("tiempos_por_tipo") or {}),
            repaso=config.get("repaso") or "leitner",
        )

    def curso_de_nivel(self, db: Session, usuario_id: str, nivel_id: str) -> CaminoCurso | None:
        m = self._m()
        nivel = db.get(m.Nivel, nivel_id)
        if nivel is None:
            return None
        seccion = db.get(m.Seccion, nivel.seccion_id)
        if seccion is None:
            return None
        return self.camino(db, usuario_id, seccion.curso_id)

    def preguntas(self, db: Session, usuario_id: str, nivel_id: str) -> list[PreguntaFuente]:
        if self.curso_de_nivel(db, usuario_id, nivel_id) is None:
            return []
        m = self._m()
        filas = db.query(m.Pregunta).filter(m.Pregunta.nivel_id == nivel_id).all()
        res = []
        for p in filas:
            if not getattr(p, "valida", True):
                continue
            d = {
                "id": p.id,
                "tipo": p.tipo,
                "enunciado": p.enunciado,
                "opciones": p.opciones,
                "respuesta": p.respuesta,
                "tolerancia": p.tolerancia,
                "dificultad": p.dificultad or 3,
                "pista": p.pista,
            }
            res.append(
                PreguntaFuente(Pregunta.desde_dict(d), p.explicacion or "", p.tiempo_s or None)
            )
        return res
