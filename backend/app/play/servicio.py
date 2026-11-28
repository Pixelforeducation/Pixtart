"""Orquestación de las reglas de `app/game` con persistencia (una instancia por petición).

El servidor es autoritativo: corrige, mide el tiempo y decide recompensas. Al cargar el estado
siempre liquida el decaimiento de `xp_color` y la resurrección perezosa de la mascota.

Errores: `NoEncontrado` → 404; `AccionInvalida` (y `SinAyuda`) → 409.
"""

from __future__ import annotations

import random
from dataclasses import replace
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.game import evolucion_mascota as evo
from app.game import experiencia as xp
from app.game import mascota as mc
from app.game import paletas as pal
from app.game import recompensas as rc
from app.game.correccion import Correccion, corregir
from app.game.economia import precio
from app.game.seleccion import (
    Leitner,
    MotorRepaso,
    elegir_preguntas,
    elegir_reintento,
    motor_para,
)
from app.game.tiempo import tiempo_limite
from app.game.tipos import TIPOS_ABIERTOS, AccionInvalida, Pregunta
from app.keys import service as keys
from app.keys.validador import MODELO_POR_DEFECTO
from app.models.juego import (
    CofrePendiente,
    EstadoJugador,
    IntentoNivel,
    NivelCompletado,
    TarjetaRepaso,
)
from app.models.usuarios import Usuario
from app.play import final, ids, serial
from app.play.fuente_cursos import CaminoCurso, FuenteCursos, NivelInfo, PreguntaFuente
from app.play.pista import ErrorPista, GeneradorPista

PREGUNTAS_POR_NIVEL = 10
MARGEN_SERVIDOR_S = 2
SEGUNDOS_POCION_TIEMPO = 10
COMIDA_INICIAL = 5
COMIDA_POR_ITEM = 5


class NoEncontrado(Exception):
    def __init__(self, mensaje: str):
        super().__init__(mensaje)
        self.mensaje = mensaje


def _zona_valida(zona: str | None) -> str:
    try:
        ZoneInfo(zona or "UTC")
        return zona or "UTC"
    except (ZoneInfoNotFoundError, ValueError):
        return "UTC"


def _item_vista(item_id: str) -> dict[str, Any]:
    d = rc.ITEMS[item_id]
    return {"item_id": ids.publico(d.id), "nombre": d.nombre, "rareza": str(d.rareza)}


def _datos_ayuda(ayuda: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """Traduce la ayuda de `app.game.mascota.ayuda_para` al formato del frontend."""
    tipo = ayuda["tipo"]
    if tipo == "eliminar_opcion":
        return tipo, {"eliminar_opcion": ayuda["eliminar_opcion"]}
    if tipo == "revelar_parte":
        return "revelar", {"revelar": ayuda["prefijo"]}
    if tipo == "intervalo":
        return tipo, {"intervalo": [ayuda["min"], ayuda["max"]]}
    if tipo == "fijar_paso":
        return tipo, {"fijar_paso": {"posicion": ayuda["posicion"], "indice": ayuda["elemento"]}}
    raise AssertionError(tipo)  # pragma: no cover


def _interno(item_id: str) -> str:
    i = ids.interno(item_id)
    if i is None:
        raise NoEncontrado("Ese artículo no existe.")
    return i


def _json_respuesta(valor: Any) -> Any:
    return list(valor) if isinstance(valor, tuple) else valor


def _tipo_nodo(n: NivelInfo) -> str:
    if n.es_final:
        return "final"
    return "calentamiento" if n.es_calentamiento else "leccion"


def _motor(nombre: str) -> MotorRepaso:
    try:
        return motor_para(nombre)
    except (NotImplementedError, ValueError):
        return Leitner()  # FSRS pendiente: se usa Leitner (misma interfaz)


def _aprobado_de(it: IntentoNivel) -> bool | None:
    """Si ese intento terminado alcanzó el mínimo (None en intentos anteriores a v0.3)."""
    return it.preguntas[0].get("aprobado") if it.preguntas else None


class Juego:
    def __init__(
        self,
        db: Session,
        usuario: Usuario,
        fuente: FuenteCursos,
        ahora: datetime,
        rng: random.Random,
        generador: GeneradorPista | None = None,
    ):
        self.db = db
        self.usuario = usuario
        self.fuente = fuente
        self.ahora = ahora
        self.rng = rng
        self.generador = generador
        self._cargar()

    # ------------------------------------------------------------ estado

    def _cargar(self) -> None:
        fila = self.db.get(EstadoJugador, self.usuario.id)
        if fila is None:
            inicial = rc.ITEMS[rc.MASCOTA_INICIAL]
            zona = _zona_valida(self.usuario.zona_horaria)
            fila = EstadoJugador(
                usuario_id=self.usuario.id,
                progreso=serial.progreso_a_json(xp.nuevo_progreso(self.ahora, zona)),
                vidas=serial.vidas_a_json(
                    mc.EstadoVidas(
                        mascota=mc.Mascota(inicial.id, inicial.especie or "", inicial.rareza),
                        comida=COMIDA_INICIAL,
                    )
                ),
                cofres=serial.cofres_a_json(rc.EstadoCofres()),
                monedas=0,
                inventario={},
                mascotas=[inicial.id],
            )
            self.db.add(fila)
        self.fila = fila
        self.progreso = xp.liquidar_decaimiento(
            serial.progreso_desde_json(fila.progreso), self.ahora
        )
        self.vidas = mc.actualizar(serial.vidas_desde_json(fila.vidas), self.ahora)
        self.cofres = serial.cofres_desde_json(fila.cofres)
        self.inventario: dict[str, int] = dict(fila.inventario or {})
        self.mascotas: list[str] = list(
            dict.fromkeys(rc.id_mascota_vigente(m) for m in (fila.mascotas or []))
        )
        self.extras = serial.extras_desde_json(fila.extras)
        self.guardar()

    def guardar(self) -> None:
        f = self.fila
        f.progreso = serial.progreso_a_json(self.progreso)
        f.vidas = serial.vidas_a_json(self.vidas)
        f.cofres = serial.cofres_a_json(self.cofres)
        f.inventario = {k: v for k, v in self.inventario.items() if v > 0}
        f.mascotas = list(self.mascotas)
        f.extras = serial.extras_a_json(self.extras)
        self.db.commit()

    def vista_estado(self) -> dict[str, Any]:
        p = self.progreso
        return {
            "xp_total_por_tema": dict(p.xp_total_por_tema),
            "tier_por_tema": p.tier_por_tema,
            "xp_color": p.xp_color,
            "paleta_activa": pal.paleta_efectiva(p.xp_color, self.fila.paleta_preferida),
            "paletas_desbloqueadas": pal.desbloqueadas(p.xp_color),
            "monedas": self.fila.monedas,
            "escudos": p.escudos,
            "racha": p.racha,
            "vidas": self.vidas.vidas,
            "mascota": self._vista_mascota(),
            "inventario": self._vista_inventario(),
            "minimo_aprobar": self.extras.minimo_aprobar,
            "equipo": {
                r: (ids.publico(i) if i else None) for r, i in self.extras.equipo.items()
            },
            "evoluciones_mascotas": {
                ids.publico(m): self._vista_evolucion(m) for m in self.mascotas
            },
        }

    def _evolucion(self, mascota_id: str) -> evo.EvolucionMascota:
        return self.extras.evoluciones.get(mascota_id, evo.EvolucionMascota())

    def _vista_evolucion(self, mascota_id: str) -> dict[str, Any]:
        x = self._evolucion(mascota_id).xp
        return {"xp": x, "etapa": evo.etapa(x), "xp_siguiente": evo.xp_siguiente(x)}

    def _etapa_equipada(self) -> int:
        m = self.vidas.mascota
        return evo.etapa(self._evolucion(m.id).xp) if m else 1

    def _vista_mascota(self) -> dict[str, Any] | None:
        v = mc.vista_mascota(self.vidas, self.ahora, self._etapa_equipada())
        if v is not None:
            ev = self._evolucion(v["id"])
            v.update(self._vista_evolucion(v["id"]), racha_sin_ayuda=ev.racha_sin_ayuda)
            v["id"] = ids.publico(v["id"])
        return v

    def _sumar_xp_mascota(self, ganada: int, ev: evo.EvolucionMascota) -> dict[str, Any] | None:
        """Guarda la evolución nueva de la mascota equipada y devuelve el `mascota_evento`."""
        m = self.vidas.mascota
        if m is None:
            return None
        antes = evo.etapa(self._evolucion(m.id).xp)
        self.extras.evoluciones[m.id] = ev
        despues = evo.etapa(ev.xp)
        return {"xp_ganada": ganada, "evoluciono": despues > antes, "etapa": despues}

    def _vista_inventario(self) -> list[dict[str, Any]]:
        """Consumibles con su cantidad y las mascotas poseídas (cantidad 1)."""
        lista = [
            {"item_id": ids.publico(k), "cantidad": v}
            for k, v in sorted(self.inventario.items())
            if v > 0
        ]
        return lista + [{"item_id": ids.publico(m), "cantidad": 1} for m in self.mascotas]

    def elegir_paleta(self, paleta_id: str) -> None:
        if paleta_id not in pal.desbloqueadas(self.progreso.xp_color):
            raise AccionInvalida("Esa paleta aún no está desbloqueada.")
        self.fila.paleta_preferida = paleta_id
        self.guardar()

    def _dar_item(self, item_id: str) -> None:
        """Mascotas van a la colección (sin duplicados); los equipables al inventario con
        cantidad 1 (se poseen una vez); los consumibles suman."""
        d = rc.ITEMS[item_id]
        if d.clase is rc.ClaseItem.MASCOTA:
            if item_id not in self.mascotas:
                self.mascotas.append(item_id)
        elif rc.es_unico(item_id):
            self.inventario[item_id] = 1
        else:
            self.inventario[item_id] = self.inventario.get(item_id, 0) + 1

    def _posee(self, item_id: str) -> bool:
        if rc.ITEMS[item_id].clase is rc.ClaseItem.MASCOTA:
            return item_id in self.mascotas
        return self.inventario.get(item_id, 0) > 0

    def _unicos_poseidos(self) -> frozenset[str]:
        """Para `excluir` en cofres y drops: no repetir mascotas ni equipables ya poseídos."""
        return frozenset(self.mascotas) | frozenset(
            k for k, v in self.inventario.items() if v > 0 and rc.es_unico(k)
        )

    # ------------------------------------------------------------ equipo y ajustes

    def equipar_item(self, item_publico: str) -> None:
        item_id = ids.interno(item_publico)
        ranura = rc.ranura_de(item_id) if item_id else None
        if item_id is None or ranura is None:
            raise AccionInvalida("Eso no se puede equipar.")
        if not self._posee(item_id):
            raise AccionInvalida("No tienes ese artículo.")
        self.extras.equipo[ranura] = item_id
        self.guardar()

    def quitar_equipo(self, ranura: str) -> None:
        if ranura not in serial.RANURAS:
            raise AccionInvalida("Esa ranura no existe.")
        self.extras.equipo[ranura] = None
        self.guardar()

    def ajustar(self, *, minimo_aprobar: int) -> None:
        if not 0 <= minimo_aprobar <= 100:
            raise AccionInvalida("El mínimo para aprobar va de 0 a 100.")
        self.extras.minimo_aprobar = int(minimo_aprobar)
        self.guardar()

    # ------------------------------------------------------------ camino

    def _camino(self, curso_id: str) -> CaminoCurso:
        camino = self.fuente.camino(self.db, self.usuario.id, curso_id)
        if camino is None:
            raise NoEncontrado("No encontramos ese curso.")
        return camino

    def _completados(self, curso_id: str) -> set[str]:
        return set(
            self.db.scalars(
                select(NivelCompletado.nivel_id).where(
                    NivelCompletado.usuario_id == self.usuario.id,
                    NivelCompletado.curso_id == curso_id,
                )
            )
        )

    def _estados_niveles(self, camino: CaminoCurso) -> dict[str, str]:
        """completado; el primer no completado es `actual`; los calentamientos no completados
        de secciones ya alcanzadas, `disponible`; el resto, `bloqueado`."""
        hechos = self._completados(camino.id)
        orden = camino.niveles()
        secciones = [s.id for s in sorted(camino.secciones, key=lambda s: s.orden)]
        idx_actual = next((i for i, (_, n) in enumerate(orden) if n.id not in hechos), None)
        sec_actual = (
            secciones.index(orden[idx_actual][0].id) if idx_actual is not None else len(secciones)
        )
        estados = {}
        for i, (s, n) in enumerate(orden):
            if n.id in hechos:
                estados[n.id] = "completado"
            elif i == idx_actual:
                estados[n.id] = "actual"
            elif n.es_calentamiento and secciones.index(s.id) <= sec_actual:
                estados[n.id] = "disponible"
            else:
                estados[n.id] = "bloqueado"
        return estados

    def camino(self, curso_id: str) -> dict[str, Any]:
        camino = self._camino(curso_id)
        estados = self._estados_niveles(camino)
        cofres: dict[str, list[CofrePendiente]] = {}
        for c in self.db.scalars(
            select(CofrePendiente)
            .where(
                CofrePendiente.usuario_id == self.usuario.id,
                CofrePendiente.curso_id == camino.id,
            )
            .order_by(CofrePendiente.created_at)
        ):
            cofres.setdefault(c.nivel_id or "", []).append(c)
        secciones = []
        for s in sorted(camino.secciones, key=lambda s: s.orden):
            nodos: list[dict[str, Any]] = []
            for n in sorted(s.niveles, key=lambda n: n.orden):
                nodos.append(
                    {
                        "id": n.id,
                        "titulo": n.titulo,
                        "estado": estados[n.id],
                        "tipo": _tipo_nodo(n),
                    }
                )
                # El cofre ganado tras este nivel: su id sirve para /cofres/{id}/abrir.
                for c in cofres.get(n.id, []):
                    nodos.append(
                        {
                            "id": c.id,
                            "titulo": "Cofre legendario" if c.tipo == "legendario" else "Cofre",
                            "estado": "completado" if c.abierto else "disponible",
                            "tipo": "cofre",
                        }
                    )
            secciones.append({"id": s.id, "titulo": s.titulo, "niveles": nodos})
        return {"secciones": secciones}

    # ------------------------------------------------------------ jugar

    def _tarjetas(self, curso_id: str) -> dict[str, TarjetaRepaso]:
        filas = self.db.scalars(
            select(TarjetaRepaso).where(
                TarjetaRepaso.usuario_id == self.usuario.id, TarjetaRepaso.curso_id == curso_id
            )
        )
        return {t.pregunta_id: t for t in filas}

    @staticmethod
    def _jugable(pf: PreguntaFuente, t_s: int, nivel: NivelInfo) -> dict[str, Any]:
        p = pf.pregunta
        return {
            "id": p.id,
            "tipo": str(p.tipo),
            "enunciado": p.enunciado,
            "opciones": list(p.opciones) if p.opciones else None,
            "dificultad": p.dificultad,
            "tiempo_s": t_s,
            "es_calentamiento": nivel.es_calentamiento,
            # Solo en abiertas, para autoevaluarse; nunca la respuesta de las demás.
            **({"explicacion": pf.explicacion} if p.tipo in TIPOS_ABIERTOS else {}),
        }

    def _intentos_nivel(self, nivel_id: str, estado: str) -> list[IntentoNivel]:
        """Intentos del usuario en ese nivel con ese estado, del más reciente al más viejo."""
        return list(
            self.db.scalars(
                select(IntentoNivel)
                .where(
                    IntentoNivel.usuario_id == self.usuario.id,
                    IntentoNivel.nivel_id == nivel_id,
                    IntentoNivel.estado == estado,
                )
                .order_by(IntentoNivel.created_at.desc(), IntentoNivel.reloj_desde.desc())
            )
        )

    def iniciar(self, nivel_id: str) -> dict[str, Any]:
        camino = self.fuente.curso_de_nivel(self.db, self.usuario.id, nivel_id)
        if camino is None:
            raise NoEncontrado("No encontramos ese nivel.")
        nivel = next(n for _, n in camino.niveles() if n.id == nivel_id)
        estado_nivel = self._estados_niveles(camino)[nivel_id]
        if estado_nivel == "bloqueado":
            raise AccionInvalida("Ese nivel aún está bloqueado.")
        en_curso = self._intentos_nivel(nivel_id, "en_curso")
        if en_curso:  # mejora 2: se retoma la partida pausada (o interrumpida) de este nivel
            return self._retomar(en_curso[0], camino, nivel)
        tarjetas = self._tarjetas(camino.id)
        vistas = {pid: serial.utc(t.vista_en) for pid, t in tarjetas.items()}
        info_final: dict[str, Any] | None = None
        furia: set[str] = set()
        reintento = False
        if nivel.es_final:
            banco, elegidas, info_final, furia = self._seleccion_final(camino, nivel, vistas)
        else:
            previo = None
            if estado_nivel != "completado":
                terminados = self._intentos_nivel(nivel_id, "terminado")
                previo = terminados[0] if terminados else None
            if previo is not None and _aprobado_de(previo) is False:
                reintento = True
                banco, elegidas = self._seleccion_reintento(camino, nivel_id, previo, vistas)
            else:
                banco, elegidas = self._seleccion_leccion(camino, nivel_id, tarjetas, vistas)
        self._abandonar_en_curso()
        requeridas = info_final["requeridas"] if info_final else None
        entradas, jugables = [], []
        for pid in elegidas:
            nid, pf = banco[pid]
            p = pf.pregunta
            t_s = int(pf.tiempo_s or tiempo_limite(
                p.tipo, p.dificultad, p.enunciado, tiempos_por_tipo=camino.tiempos_por_tipo
            ))
            if pid in furia:
                t_s = final.tiempo_furia(t_s)
            entrada = {
                "pregunta_id": pid,
                "nivel_id": nid,
                "tiempo_s": t_s,
                "respondida": False,
                "correcta": None,
                "timeout": False,
                "ayudas_dadas": [],
            }
            if requeridas is not None:
                entrada["requeridas"] = requeridas
            entradas.append(entrada)
            jugables.append(self._jugable(pf, t_s, nivel))
            fila = tarjetas.get(pid)
            if fila is None:
                fila = TarjetaRepaso(
                    usuario_id=self.usuario.id,
                    curso_id=camino.id,
                    nivel_id=nid,
                    pregunta_id=pid,
                    vista_en=self.ahora,
                )
                self.db.add(fila)
                tarjetas[pid] = fila
            else:
                fila.vista_en = self.ahora
        if reintento and entradas:
            entradas[0]["reintento"] = True

        intento = IntentoNivel(
            usuario_id=self.usuario.id,
            curso_id=camino.id,
            nivel_id=nivel_id,
            tema=camino.tema,
            calentamiento=nivel.es_calentamiento,
            es_final=nivel.es_final,
            es_jefe=nivel.es_jefe,
            repetido=estado_nivel == "completado",
            preguntas=entradas,
            reloj_desde=self.ahora,
            segundos_extra=0,
            xp_ganada=0,
        )
        self.db.add(intento)
        self.vidas = mc.iniciar_nivel(self.vidas, self.ahora, es_final=nivel.es_final)
        self.guardar()
        salida: dict[str, Any] = {"intento_id": intento.id, "preguntas": jugables}
        if reintento:
            salida["reintento"] = True
        if info_final is not None:
            salida["final"] = {**info_final, **final.progreso(entradas, info_final["requeridas"])}
        return salida

    # ------------------------------------------------------------ pausa (mejora 2)

    @staticmethod
    def _idx_en_curso(it: IntentoNivel) -> int | None:
        return next((i for i, e in enumerate(it.preguntas) if not e["respondida"]), None)

    def pausar(self, intento_id: str) -> None:
        """Congela el reloj de la pregunta en curso (se guarda `pausada_en` en su entrada)."""
        it = self._intento(intento_id)
        i = self._idx_en_curso(it)
        if i is None:
            return
        e = dict(it.preguntas[i])
        if e.get("pausada_en"):
            return  # ya estaba pausada: idempotente
        e["pausada_en"] = self.ahora.isoformat()
        self._poner_entrada(it, i, e)
        self.db.commit()

    def _reanudar_reloj(self, it: IntentoNivel) -> None:
        """Si la partida está pausada, mueve `reloj_desde` para que el tiempo pausado no cuente."""
        for i, e in enumerate(it.preguntas):
            if e.get("pausada_en"):
                pausada = serial.utc(datetime.fromisoformat(e["pausada_en"]))
                consumido = max(pausada - serial.utc(it.reloj_desde), timedelta(0))
                it.reloj_desde = self.ahora - consumido
                e = dict(e)
                del e["pausada_en"]
                self._poner_entrada(it, i, e)

    def _retomar(
        self, it: IntentoNivel, camino: CaminoCurso, nivel: NivelInfo
    ) -> dict[str, Any]:
        pausada = any(e.get("pausada_en") for e in it.preguntas)
        self._reanudar_reloj(it)
        i_actual = self._idx_en_curso(it)
        if not pausada and i_actual is not None:
            # Se cerró la pestaña sin pausar: la pregunta en curso no se da por perdida, vuelve a
            # empezar su tiempo (las ya respondidas se quedan como estaban).
            limite = it.preguntas[i_actual]["tiempo_s"] + (it.segundos_extra or 0)
            if (self.ahora - serial.utc(it.reloj_desde)).total_seconds() >= limite:
                it.reloj_desde = self.ahora
        # La marca «sin ayudas» es del nivel final: al retomar se ajusta al intento que se retoma.
        self.vidas = replace(self.vidas, nivel_sin_ayudas=bool(it.es_final))
        cache: dict[str, dict[str, PreguntaFuente]] = {}
        jugables, respondidas = [], []
        for e in it.preguntas:
            nid = e["nivel_id"]
            if nid not in cache:
                cache[nid] = {
                    pf.pregunta.id: pf
                    for pf in self.fuente.preguntas(self.db, self.usuario.id, nid)
                }
            pf = cache[nid].get(e["pregunta_id"])
            if pf is None:  # pragma: no cover - pregunta borrada a mitad de partida
                continue
            jugables.append(self._jugable(pf, int(e["tiempo_s"]), nivel))
            if e["respondida"]:
                respondidas.append({
                    "pregunta_id": e["pregunta_id"],
                    "correcta": bool(e["correcta"]),
                    "xp_ganada": int(e.get("xp_ganada", xp.xp_respuesta(bool(e["correcta"])))),
                })
        restante = 0
        i = self._idx_en_curso(it)
        if i is not None:
            limite = it.preguntas[i]["tiempo_s"] + (it.segundos_extra or 0)
            transcurrido = (self.ahora - serial.utc(it.reloj_desde)).total_seconds()
            restante = max(0, int(limite - transcurrido))
        self.guardar()
        salida: dict[str, Any] = {
            "intento_id": it.id,
            "preguntas": jugables,
            "reanudado": True,
            "progreso": {
                "respondidas": respondidas,
                "restante_s": restante,
                "xp_ganada": it.xp_ganada or 0,
            },
        }
        if it.preguntas and it.preguntas[0].get("reintento"):
            salida["reintento"] = True
        if it.es_final:
            n = len(it.preguntas)
            req = int(it.preguntas[0].get("requeridas", n)) if n else 0
            salida["final"] = {
                "g": camino.final_g,
                "n_configurado": camino.final_n,
                "requeridas": req,
                "encuentros": final.plan_encuentros(n),
                **final.progreso(list(it.preguntas), req),
            }
        return salida

    def _abandonar_en_curso(self) -> None:
        """Abandona otros intentos en curso (el cupo de ayudas es por nivel)."""
        for viejo in self.db.scalars(
            select(IntentoNivel).where(
                IntentoNivel.usuario_id == self.usuario.id, IntentoNivel.estado == "en_curso"
            )
        ):
            viejo.estado = "abandonado"

    def _seleccion_leccion(
        self,
        camino: CaminoCurso,
        nivel_id: str,
        tarjetas: dict[str, TarjetaRepaso],
        vistas: dict[str, datetime],
    ) -> tuple[dict[str, tuple[str, PreguntaFuente]], list[str]]:
        propias = self.fuente.preguntas(self.db, self.usuario.id, nivel_id)
        if not propias:
            raise AccionInvalida("Este nivel no tiene preguntas.")
        # Repaso: tarjetas vencidas de otros niveles ya completados del mismo curso.
        hechos = self._completados(camino.id)
        motor = _motor(camino.repaso)
        vencidas_filas = sorted(
            (
                t
                for t in tarjetas.values()
                if t.tarjeta is not None
                and t.nivel_id != nivel_id
                and t.nivel_id in hechos
                and motor.vencida(serial.tarjeta_desde_json(t.tarjeta), self.ahora)
            ),
            key=lambda t: serial.tarjeta_desde_json(t.tarjeta).vence,
        )
        banco: dict[str, tuple[str, PreguntaFuente]] = {
            pf.pregunta.id: (nivel_id, pf) for pf in propias
        }
        cache: dict[str, list[PreguntaFuente]] = {}
        for t in vencidas_filas:
            if t.nivel_id not in cache:
                cache[t.nivel_id] = self.fuente.preguntas(self.db, self.usuario.id, t.nivel_id)
            for pf in cache[t.nivel_id]:
                if pf.pregunta.id == t.pregunta_id:
                    banco[pf.pregunta.id] = (t.nivel_id, pf)
        vencidas = [t.pregunta_id for t in vencidas_filas if t.pregunta_id in banco]
        n = min(PREGUNTAS_POR_NIVEL, len(propias))
        return banco, elegir_preguntas(list(banco), n, self.rng, vistas=vistas, vencidas=vencidas)

    def _seleccion_reintento(
        self,
        camino: CaminoCurso,
        nivel_id: str,
        previo: IntentoNivel,
        vistas: dict[str, datetime],
    ) -> tuple[dict[str, tuple[str, PreguntaFuente]], list[str]]:
        """Mejora 6: tras no aprobar, preguntas distintas de la misma dificultad (propias no
        servidas → de otros niveles de la sección → repetidas solo como último recurso)."""
        propias = self.fuente.preguntas(self.db, self.usuario.id, nivel_id)
        if not propias:
            raise AccionInvalida("Este nivel no tiene preguntas.")
        banco: dict[str, tuple[str, PreguntaFuente]] = {
            pf.pregunta.id: (nivel_id, pf) for pf in propias
        }
        fallidas = [str(e["pregunta_id"]) for e in previo.preguntas]
        seccion = next(s for s, n in camino.niveles() if n.id == nivel_id)
        otras: dict[str, tuple[str, PreguntaFuente]] = {}
        for n in sorted(seccion.niveles, key=lambda n: n.orden):
            if n.id == nivel_id or n.es_final:
                continue
            for pf in self.fuente.preguntas(self.db, self.usuario.id, n.id):
                otras.setdefault(pf.pregunta.id, (n.id, pf))
        todas = {**otras, **banco}
        dificultades = {todas[f][1].pregunta.dificultad for f in fallidas if f in todas}
        alternas = [
            pid for pid, (_, pf) in otras.items()
            if pid not in banco and pf.pregunta.dificultad in dificultades
        ]
        for pid in alternas:
            banco[pid] = otras[pid]
        for f in fallidas:  # repaso servido de otro nivel: también es candidato de último recurso
            if f not in banco and f in todas:
                banco[f] = todas[f]
        n = min(PREGUNTAS_POR_NIVEL, len(propias))
        elegidas = elegir_reintento(
            [pf.pregunta.id for pf in propias], alternas, fallidas, n, self.rng, vistas=vistas
        )
        return banco, [pid for pid in elegidas if pid in banco]

    def _seleccion_final(
        self, camino: CaminoCurso, nivel: NivelInfo, vistas: dict[str, datetime]
    ) -> tuple[dict[str, tuple[str, PreguntaFuente]], list[str], dict[str, Any], set[str]]:
        """Examen del nivel final: preguntas propias del nivel más las de los demás niveles de su
        sección (sin abiertas, que se autoevalúan). Las nunca vistas primero; orden por
        dificultad creciente para que el jefe se quede con las más difíciles."""
        seccion = next(s for s, n in camino.niveles() if n.id == nivel.id)
        banco: dict[str, tuple[str, PreguntaFuente]] = {}
        abiertas: dict[str, tuple[str, PreguntaFuente]] = {}
        origen = [nivel] + [n for n in sorted(seccion.niveles, key=lambda n: n.orden)
                            if n.id != nivel.id and not n.es_final]
        for n in origen:
            for pf in self.fuente.preguntas(self.db, self.usuario.id, n.id):
                destino = abiertas if pf.pregunta.tipo in TIPOS_ABIERTOS else banco
                destino.setdefault(pf.pregunta.id, (n.id, pf))
        if not banco:
            banco = abiertas  # sección solo de abiertas: mejor eso que no poder jugar
        if not banco:
            raise AccionInvalida("Este nivel final no tiene preguntas.")
        n = min(camino.final_n, len(banco))
        elegidas = elegir_preguntas(list(banco), n, self.rng, vistas=vistas)
        elegidas.sort(key=lambda pid: banco[pid][1].pregunta.dificultad)
        plan = final.plan_encuentros(n)
        jefe = plan[-1]
        furia = set(elegidas[jefe["fase2_desde"]:]) if "fase2_desde" in jefe else set()
        info = {
            "g": camino.final_g,
            "n_configurado": camino.final_n,
            "requeridas": final.requeridas(n, camino.final_g),
            "encuentros": plan,
        }
        return banco, elegidas, info, furia

    def _intento(self, intento_id: str, *, en_curso: bool = True) -> IntentoNivel:
        it = self.db.get(IntentoNivel, intento_id)
        if it is None or it.usuario_id != self.usuario.id:
            raise NoEncontrado("No encontramos esa partida.")
        if en_curso and it.estado != "en_curso":
            raise AccionInvalida("Esta partida ya terminó.")
        return it

    @staticmethod
    def _entrada(it: IntentoNivel, pregunta_id: str) -> tuple[int, dict[str, Any]]:
        for i, e in enumerate(it.preguntas):
            if e["pregunta_id"] == str(pregunta_id):
                return i, dict(e)
        raise AccionInvalida("Esa pregunta no es de esta partida.")

    def _pregunta(self, entrada: dict[str, Any]) -> PreguntaFuente:
        for pf in self.fuente.preguntas(self.db, self.usuario.id, entrada["nivel_id"]):
            if pf.pregunta.id == entrada["pregunta_id"]:
                return pf
        raise NoEncontrado("Esa pregunta ya no existe.")

    @staticmethod
    def _poner_entrada(it: IntentoNivel, i: int, entrada: dict[str, Any]) -> None:
        lista = [dict(e) for e in it.preguntas]
        lista[i] = entrada
        it.preguntas = lista

    def _registrar_tarjeta(self, curso_id: str, repaso: str, pid: str, correcta: bool) -> None:
        fila = self.db.scalar(
            select(TarjetaRepaso).where(
                TarjetaRepaso.usuario_id == self.usuario.id, TarjetaRepaso.pregunta_id == pid
            )
        )
        if fila is None:  # pragma: no cover - se crea al servir
            return
        motor = _motor(repaso)
        t = serial.tarjeta_desde_json(fila.tarjeta) if fila.tarjeta else motor.nueva(self.ahora)
        fila.tarjeta = serial.tarjeta_a_json(motor.registrar(t, correcta, self.ahora))

    def responder(
        self, intento_id: str, pregunta_id: str, respuesta: Any, tiempo_ms: int
    ) -> dict[str, Any]:
        it = self._intento(intento_id)
        # Responder sin reanudar: el tiempo pausado no cuenta (reanuda implícitamente).
        self._reanudar_reloj(it)
        i, e = self._entrada(it, pregunta_id)
        if e["respondida"]:
            raise AccionInvalida("Ya respondiste esa pregunta.")
        if it.es_final and self._progreso_final(it)["resultado"] == "derrota":
            raise AccionInvalida("El examen terminó: el aprobado ya no es alcanzable.")
        pf = self._pregunta(e)
        p = pf.pregunta

        limite = e["tiempo_s"] + (it.segundos_extra or 0)
        transcurrido = (self.ahora - serial.utc(it.reloj_desde)).total_seconds()
        timeout = transcurrido > limite + MARGEN_SERVIDOR_S or max(tiempo_ms, 0) / 1000 > limite

        if respuesta is None:  # el cliente agotó el tiempo
            timeout = True
            correcta = False
        elif p.tipo in TIPOS_ABIERTOS:
            autoeval = respuesta.get("autoevaluacion") if isinstance(respuesta, dict) else respuesta
            if not isinstance(autoeval, bool):
                raise AccionInvalida(
                    "En preguntas abiertas envía tu autoevaluación: true si la acertaste."
                )
            correcta = autoeval
        else:
            correcta = corregir(p, respuesta) is Correccion.CORRECTA
        correcta = correcta and not timeout

        mascota_evento = None
        if not it.es_final:  # el nivel final no usa vidas de mascota (Q106) ni da XP de mascota
            viva = mc.esta_viva(self.vidas, self.ahora)
            vidas_antes = self.vidas.vidas
            self.vidas = mc.registrar_respuesta(
                self.vidas, correcta, self.ahora, calentamiento=it.calentamiento
            )
            perdio_vida = self.vidas.vidas < vidas_antes
            e["vida_perdida"] = perdio_vida
            if viva and self.vidas.mascota is not None:
                ev, xp_mascota = evo.registrar_respuesta(
                    self._evolucion(self.vidas.mascota.id),
                    correcta=correcta,
                    uso_ayuda=bool(e.get("ayuda_pedida")),
                    perdio_vida=perdio_vida,
                )
                mascota_evento = self._sumar_xp_mascota(xp_mascota, ev)
        ganada = xp.xp_respuesta(correcta)
        self.progreso = xp.sumar_xp(self.progreso, it.tema, ganada, self.ahora)
        camino = self.fuente.curso_de_nivel(self.db, self.usuario.id, it.nivel_id)
        self._registrar_tarjeta(
            it.curso_id, camino.repaso if camino else "leitner", p.id, correcta
        )

        e.update(respondida=True, correcta=correcta, timeout=timeout, xp_ganada=ganada)
        self._poner_entrada(it, i, e)
        it.reloj_desde = self.ahora
        it.segundos_extra = 0
        it.xp_ganada = (it.xp_ganada or 0) + ganada
        self.guardar()
        salida = {
            "correcta": correcta,
            "respuesta_correcta": _json_respuesta(p.respuesta),
            "explicacion": pf.explicacion,
            "vidas": self.vidas.vidas,
            "mascota": self._vista_mascota(),
            "xp_ganada": ganada,
            "mascota_evento": mascota_evento,
        }
        if it.es_final:
            salida["final"] = self._progreso_final(it)
        return salida

    @staticmethod
    def _progreso_final(it: IntentoNivel) -> dict[str, Any]:
        entradas = list(it.preguntas)
        n = len(entradas)
        req = int(entradas[0].get("requeridas", n)) if entradas else 0
        return final.progreso(entradas, req)

    # ------------------------------------------------------------ ayudas

    def _pista_ia(self, p: Pregunta, pista_escrita: str | None) -> dict[str, Any]:
        key = keys.obtener_key_descifrada(self.db, self.usuario.id)
        if key and self.generador is not None:
            try:
                keys.verificar_limite(self.db, self.usuario.id, ahora=self.ahora)
                modelo = (
                    keys.obtener_modelo(self.db, self.usuario.id)
                    or MODELO_POR_DEFECTO["anthropic"]
                )
                generada = self.generador.generar(key, modelo, p)
            except (ErrorPista, keys.LimiteExcedido):
                generada = None
            if generada is not None:
                try:
                    keys.registrar_uso(
                        self.db,
                        self.usuario.id,
                        generada.tokens_entrada,
                        generada.tokens_salida,
                        ahora=self.ahora,
                    )
                except keys.LimiteExcedido:
                    pass  # los tokens ya se gastaron: se entrega la pista igualmente
                return {"pista": generada.texto}
        if pista_escrita:
            return {"pista": pista_escrita}
        raise mc.SinAyuda("No hay pista disponible para esta pregunta.")

    def ayuda(self, intento_id: str, pregunta_id: str) -> dict[str, Any]:
        it = self._intento(intento_id)
        if it.es_final:
            raise AccionInvalida("El nivel final es un examen: no hay ayudas.")
        self._reanudar_reloj(it)
        i, e = self._entrada(it, pregunta_id)
        if e["respondida"]:
            raise AccionInvalida("Esa pregunta ya fue respondida.")
        p = self._pregunta(e).pregunta
        ya = frozenset(int(x) for x in e["ayudas_dadas"])
        nuevas_vidas, ayuda = mc.usar_ayuda(
            self.vidas, p, self.rng, self.ahora, ya_dadas=ya, etapa=self._etapa_equipada()
        )
        if ayuda["tipo"] == "pista_ia":
            tipo, datos = "pista", self._pista_ia(p, ayuda.get("pista_escrita"))
        else:
            tipo, datos = _datos_ayuda(ayuda)
            marca = ayuda.get("eliminar_opcion", ayuda.get("posicion"))
            if marca is not None:
                e["ayudas_dadas"] = [*e["ayudas_dadas"], int(marca)]
        e["ayuda_pedida"] = True  # corta la racha de la mascota en esta pregunta
        e["ayudas_pedidas"] = int(e.get("ayudas_pedidas", 0)) + 1
        self._poner_entrada(it, i, e)
        self.vidas = nuevas_vidas
        self.guardar()
        return {"tipo_ayuda": tipo, "datos": datos}

    # ------------------------------------------------------------ terminar y cofres

    def terminar(self, intento_id: str) -> dict[str, Any]:
        it = self._intento(intento_id)
        if it.es_final:
            return self._terminar_final(it)
        entradas = [dict(e) for e in it.preguntas]
        for e in entradas:
            e.pop("pausada_en", None)
            if not e["respondida"]:  # sin responder = timeout
                e.update(respondida=True, correcta=False, timeout=True)
                antes = self.vidas.vidas
                self.vidas = mc.registrar_respuesta(
                    self.vidas, False, self.ahora, calentamiento=it.calentamiento
                )
                e["vida_perdida"] = self.vidas.vidas < antes
        hubo_timeout = any(e["timeout"] for e in entradas)
        perfecto = all(e["correcta"] for e in entradas)
        aciertos = sum(bool(e["correcta"]) for e in entradas)
        porcentaje = aciertos * 100 // len(entradas) if entradas else 0
        # Mejora 6: el mínimo no aplica a los calentamientos (siempre se pasan).
        minimo = 0 if it.calentamiento else self.extras.minimo_aprobar
        aprobado = porcentaje >= minimo
        if entradas:
            entradas[0]["aprobado"] = aprobado
        it.preguntas = entradas

        camino = self.fuente.curso_de_nivel(self.db, self.usuario.id, it.nivel_id)
        if camino is None:
            raise NoEncontrado("No encontramos ese nivel.")
        repetido = it.repetido or it.nivel_id in self._completados(camino.id)

        if not aprobado:
            ganada = 0  # solo cuenta la XP de las respuestas
        elif not repetido:
            self.progreso, ganada = xp.completar_nivel(
                self.progreso, it.tema, self.ahora, perfecto=perfecto, es_jefe=it.es_jefe
            )
        elif not it.calentamiento:
            # Repetir: sin bonus de nivel; cuenta como día jugado (repaso).
            self.progreso, ganada = xp.registrar_dia_jugado(self.progreso, self.ahora)
            self.progreso = xp.sumar_xp(self.progreso, it.tema, ganada, self.ahora)
        else:
            ganada = 0

        # No aprobado: monedas de nivel repetido, sin ítem ni avance del contador de cofres.
        self.cofres, drop = rc.drop_nivel(
            self.cofres,
            self.rng,
            repetido=repetido or not aprobado,
            es_final=it.es_final,
            excluir=self._unicos_poseidos(),
        )
        self.fila.monedas += drop.monedas
        if drop.item:
            self._dar_item(drop.item)
        cofre = None
        if drop.cofre:
            fila_cofre = CofrePendiente(
                usuario_id=self.usuario.id,
                tipo=str(drop.cofre),
                curso_id=camino.id,
                nivel_id=it.nivel_id,
            )
            self.db.add(fila_cofre)
            self.db.flush()
            cofre = {"id": fila_cofre.id, "tipo": str(drop.cofre)}

        completa_seccion = False
        if aprobado and not repetido:
            self.db.add(
                NivelCompletado(
                    usuario_id=self.usuario.id,
                    curso_id=camino.id,
                    nivel_id=it.nivel_id,
                    perfecto=perfecto,
                )
            )
            hechos = self._completados(camino.id) | {it.nivel_id}
            seccion = next(s for s, n in camino.niveles() if n.id == it.nivel_id)
            completa_seccion = all(n.id in hechos for n in seccion.niveles)
        if aprobado:
            self.vidas = mc.completar_nivel(
                self.vidas,
                self.ahora,
                sin_timeouts=not hubo_timeout,
                completa_seccion=completa_seccion,
            )
        self.vidas = replace(self.vidas, nivel_sin_ayudas=False)

        # Mejora 10: bonus de mascota por nivel sin ayudas y/o sin perder vidas.
        mascota_evento = None
        if self.vidas.mascota is not None:
            bonus = evo.bonus_nivel(
                ayudas_usadas=sum(int(e.get("ayudas_pedidas", 0)) for e in entradas),
                vidas_perdidas=sum(bool(e.get("vida_perdida")) for e in entradas),
                aprobado=aprobado,
            )
            if bonus:
                ev = self._evolucion(self.vidas.mascota.id)
                mascota_evento = self._sumar_xp_mascota(bonus, replace(ev, xp=ev.xp + bonus))

        it.estado = "terminado"
        it.xp_ganada = (it.xp_ganada or 0) + ganada
        self.guardar()
        return {
            "xp_ganada": it.xp_ganada,
            "monedas": drop.monedas,
            "drop": _item_vista(drop.item) if drop.item else None,
            "cofre": cofre,
            "perfecto": perfecto,
            "vidas": self.vidas.vidas,
            "aprobado": aprobado,
            "porcentaje": porcentaje,
            "minimo": minimo,
            "mascota_evento": mascota_evento,
        }

    def _terminar_final(self, it: IntentoNivel) -> dict[str, Any]:
        """Cierra el examen. Aprobado (aciertos ≥ requeridas, aunque queden preguntas: Q37) →
        cofre legendario (Q15) + XP de jefe; reprobado → sin recompensa ni progreso. Las
        preguntas sin responder no cuentan como timeout ni cuestan vidas (no hay mascota)."""
        prog = self._progreso_final(it)
        aprobado = prog["resultado"] == "victoria"
        camino = self.fuente.curso_de_nivel(self.db, self.usuario.id, it.nivel_id)
        if camino is None:
            raise NoEncontrado("No encontramos ese nivel.")
        repetido = it.repetido or it.nivel_id in self._completados(camino.id)
        ganada, monedas, drop_item, cofre = 0, 0, None, None
        perfecto = aprobado and prog["aciertos"] == prog["n"]
        if aprobado:
            if not repetido:
                self.progreso, ganada = xp.completar_nivel(
                    self.progreso, it.tema, self.ahora, perfecto=perfecto, es_jefe=True
                )
            else:
                self.progreso, ganada = xp.registrar_dia_jugado(self.progreso, self.ahora)
                self.progreso = xp.sumar_xp(self.progreso, it.tema, ganada, self.ahora)
            self.cofres, drop = rc.drop_nivel(
                self.cofres,
                self.rng,
                repetido=repetido,
                es_final=True,
                excluir=self._unicos_poseidos(),
            )
            monedas, drop_item = drop.monedas, drop.item
            self.fila.monedas += monedas
            if drop_item:
                self._dar_item(drop_item)
            if drop.cofre:
                fila_cofre = CofrePendiente(
                    usuario_id=self.usuario.id,
                    tipo=str(drop.cofre),
                    curso_id=camino.id,
                    nivel_id=it.nivel_id,
                )
                self.db.add(fila_cofre)
                self.db.flush()
                cofre = {"id": fila_cofre.id, "tipo": str(drop.cofre)}
            if not repetido:
                self.db.add(
                    NivelCompletado(
                        usuario_id=self.usuario.id,
                        curso_id=camino.id,
                        nivel_id=it.nivel_id,
                        perfecto=perfecto,
                    )
                )
                hechos = self._completados(camino.id) | {it.nivel_id}
                seccion = next(s for s, n in camino.niveles() if n.id == it.nivel_id)
                if all(n.id in hechos for n in seccion.niveles):
                    self.vidas = mc.completar_nivel(
                        self.vidas, self.ahora, sin_timeouts=True, completa_seccion=True
                    )
        self.vidas = replace(self.vidas, nivel_sin_ayudas=False)
        entradas = [dict(e) for e in it.preguntas]
        for e in entradas:
            e.pop("pausada_en", None)
        if entradas:
            entradas[0]["aprobado"] = aprobado
        it.preguntas = entradas
        it.estado = "terminado"
        it.xp_ganada = (it.xp_ganada or 0) + ganada
        self.guardar()
        return {
            "xp_ganada": it.xp_ganada,
            "monedas": monedas,
            "drop": _item_vista(drop_item) if drop_item else None,
            "cofre": cofre,
            "perfecto": perfecto,
            "vidas": self.vidas.vidas,
            "final": {**prog, "aprobado": aprobado},
        }

    def abrir_cofre(self, cofre_id: str) -> dict[str, Any]:
        c = self.db.get(CofrePendiente, cofre_id)
        if c is None or c.usuario_id != self.usuario.id:
            raise NoEncontrado("No encontramos ese cofre.")
        if c.abierto:
            raise AccionInvalida("Ese cofre ya está abierto.")
        self.cofres, contenido = rc.abrir_cofre(
            self.cofres, c.tipo, self.rng, excluir=self._unicos_poseidos()
        )
        c.abierto = True
        self.fila.monedas += contenido.monedas
        for item in contenido.items:
            self._dar_item(item)
        self.guardar()
        return {"items": [_item_vista(i) for i in contenido.items], "monedas": contenido.monedas}

    # ------------------------------------------------------------ tienda e ítems

    @staticmethod
    def tienda() -> list[dict[str, Any]]:
        return [
            {**_item_vista(i.id), "precio": precio(i.id), "clase": str(i.clase)}
            for i in rc.CATALOGO
        ]

    def comprar(self, item_publico: str) -> dict[str, Any]:
        item_id = _interno(item_publico)
        d = rc.ITEMS[item_id]
        if d.clase is rc.ClaseItem.MASCOTA and item_id in self.mascotas:
            raise AccionInvalida("Ya tienes esa mascota.")
        if rc.es_unico(item_id) and self._posee(item_id):
            raise AccionInvalida("Ya tienes ese artículo.")
        costo = precio(item_id)
        if self.fila.monedas < costo:
            raise AccionInvalida("No te alcanzan las monedas.")
        self.fila.monedas -= costo
        self._dar_item(item_id)
        self.guardar()
        return {"monedas": self.fila.monedas, "inventario": self._vista_inventario()}

    def usar_item(
        self, item_id: str, *, intento_id: str | None = None, pregunta_id: str | None = None
    ) -> dict[str, Any] | None:
        """Aplica un consumible. Devuelve un `efecto` extra para lupa y poción de tiempo."""
        item_id = _interno(item_id)
        d = rc.ITEMS[item_id]
        if d.clase is rc.ClaseItem.MASCOTA:
            raise AccionInvalida("Las mascotas se equipan, no se usan.")
        if rc.ranura_de(item_id) is not None:
            raise AccionInvalida("Las armas, armaduras y ropa se equipan, no se usan.")
        if self.inventario.get(item_id, 0) <= 0:
            raise AccionInvalida("No tienes ese artículo.")
        if intento_id and self._intento(intento_id).es_final:
            raise AccionInvalida("En el nivel final no se usan objetos.")  # Q38
        efecto = None
        if item_id == "botiquin":
            self.vidas = mc.usar_botiquin(self.vidas, self.ahora)
        elif item_id == "pocion_resurreccion":
            self.vidas = mc.usar_pocion_resurreccion(self.vidas, self.ahora)
        elif item_id == "comida_mascota":
            self.vidas = mc.dar_comida(self.vidas, COMIDA_POR_ITEM)
        elif item_id == "escudo_color":
            self.progreso = xp.comprar_escudo(self.progreso, self.ahora)
        elif item_id == "pocion_tiempo":
            if not intento_id:
                raise AccionInvalida("La poción de tiempo se usa durante una partida.")
            it = self._intento(intento_id)
            it.segundos_extra = (it.segundos_extra or 0) + SEGUNDOS_POCION_TIEMPO
            efecto = {"segundos_extra": it.segundos_extra}
        elif item_id == "lupa":
            if not intento_id or not pregunta_id:
                raise AccionInvalida("La lupa se usa sobre una pregunta de tu partida.")
            it = self._intento(intento_id)
            _, e = self._entrada(it, pregunta_id)
            if e["respondida"]:
                raise AccionInvalida("Esa pregunta ya fue respondida.")
            pista = self._pregunta(e).pregunta.pista
            if not pista:
                raise AccionInvalida("Esta pregunta no tiene pista.")
            efecto = {"pista": pista}
        else:  # pragma: no cover - catálogo cerrado
            raise AccionInvalida("Ese artículo no se puede usar.")
        self.inventario[item_id] -= 1
        self.guardar()
        return efecto

    def equipar(self, mascota_publica: str) -> None:
        mascota_id = ids.interno(mascota_publica) or ""
        d = rc.ITEMS.get(mascota_id)
        if d is None or d.clase is not rc.ClaseItem.MASCOTA or mascota_id not in self.mascotas:
            raise AccionInvalida("No tienes esa mascota.")
        self.vidas = mc.equipar(
            self.vidas, mc.Mascota(d.id, d.especie or "", d.rareza), self.ahora
        )
        self.guardar()

