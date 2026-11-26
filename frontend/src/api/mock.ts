// API falsa en memoria para desarrollar y testear sin backend (VITE_MOCK=1).
import { ErrorApi, type Api } from "./cliente";
import type * as T from "./tipos";
import { problemaLista } from "../lib/pdfs";

type Id = number | string;

const clonar = <X>(x: X): X => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

let sig = 1000;
const nuevoId = () => ++sig;

function p(
  id: number,
  tipo: T.TipoPregunta,
  enunciado: string,
  respuesta: T.RespuestaPregunta,
  extra: Partial<T.Pregunta> = {},
): T.Pregunta {
  return {
    id,
    tipo,
    enunciado,
    respuesta,
    explicacion: extra.explicacion ?? "Revisa la sección correspondiente del PDF.",
    pista: extra.pista ?? null,
    dificultad: 2,
    tiempo_s: tipo === "math_problem" || tipo === "proof" ? 900 : 45,
    fuente_pagina: 3,
    valida: true,
    problemas: [],
    ...extra,
  };
}

export function cursoEjemplo(): T.Curso {
  return {
    id: 1,
    titulo: "Fotosíntesis básica",
    tema: "biologia",
    estado: "publicado",
    secciones: [
      {
        id: 10,
        titulo: "La hoja",
        orden: 1,
        niveles: [
          {
            id: 100,
            titulo: "Calentamiento",
            orden: 1,
            es_calentamiento: true,
            preguntas: [
              p(1, "multiple_choice", "¿Qué pigmento capta la luz en las plantas?", 1, {
                opciones: ["Hemoglobina", "Clorofila", "Melanina", "Caroteno azul"],
                explicacion: "La clorofila absorbe luz roja y azul.",
                pista: "Da el color verde.",
              }),
              p(2, "true_false", "La fotosíntesis libera oxígeno.", true, {
                explicacion: "El O₂ proviene de la ruptura del agua.",
              }),
            ],
          },
          {
            id: 101,
            titulo: "Cloroplastos",
            orden: 2,
            es_calentamiento: false,
            preguntas: [
              p(3, "fill_text", "El orgánulo donde ocurre la fotosíntesis es el ____.", ["cloroplasto", "cloroplastos"], {
                explicacion: "Los cloroplastos contienen tilacoides.",
              }),
              p(4, "numeric", "¿Cuántas moléculas de CO₂ se fijan para formar una glucosa?", 6, {
                tolerancia: 0,
                explicacion: "6 CO₂ + 6 H₂O → C₆H₁₂O₆ + 6 O₂",
              }),
              p(5, "ordering", "Ordena las etapas.", [0, 1, 2], {
                opciones: ["Absorción de luz", "Fotólisis del agua", "Ciclo de Calvin"],
                explicacion: "Primero la fase luminosa y luego la oscura.",
              }),
            ],
          },
          {
            id: 102,
            titulo: "Balance",
            orden: 3,
            es_calentamiento: false,
            preguntas: [
              p(6, "open", "Explica por qué las plantas necesitan luz.", "La luz aporta la energía para…", {
                explicacion: "La energía luminosa se convierte en ATP y NADPH.",
              }),
              p(7, "math_problem", "Si una hoja fija 2 µmol CO₂/s, ¿cuántos µmol fija en 1 h?", "7200 µmol", {
                explicacion: "2 × 3600 = 7200.",
              }),
            ],
          },
        ],
      },
      {
        id: 11,
        titulo: "Ciclo de Calvin",
        orden: 2,
        niveles: [
          {
            id: 110,
            titulo: "RuBisCO",
            orden: 1,
            es_calentamiento: false,
            preguntas: [
              p(8, "multiple_choice", "¿Qué enzima fija el CO₂?", 0, {
                opciones: ["RuBisCO", "ATP sintasa", "Amilasa"],
                explicacion: "La RuBisCO es la enzima más abundante del planeta.",
              }),
              p(9, "proof", "Demuestra que el balance de carbono de la ecuación global es correcto.", "6 C a cada lado.", {
                explicacion: "Cuenta los átomos de C: 6 en 6 CO₂ y 6 en C₆H₁₂O₆.",
              }),
            ],
          },
        ],
      },
    ],
  };
}

function cursoBorrador(): T.Curso {
  const c = cursoEjemplo();
  c.id = 2;
  c.titulo = "Álgebra lineal (borrador)";
  c.tema = "matematicas";
  c.estado = "borrador";
  let n = 200;
  c.secciones.forEach((s) => {
    s.id = nuevoId();
    s.niveles.forEach((nv) => {
      nv.id = nuevoId();
      nv.preguntas.forEach((q) => (q.id = ++n));
    });
  });
  const mala = c.secciones[0].niveles[0].preguntas[0];
  mala.valida = false;
  mala.problemas = ["La respuesta correcta no está entre las opciones.", "El enunciado es ambiguo."];
  mala.respuesta = 7;
  return c;
}

const ESTADOS_TRABAJO: T.EstadoTrabajo[] = ["subiendo", "leyendo", "analizando", "generando", "validando", "listo"];

export interface OpcionesMock {
  /** Usuarios ya registrados (correo → contraseña). */
  usuarios?: Record<string, string>;
  estado?: Partial<T.Estado>;
  conKey?: boolean;
  ahora?: () => number;
  /** Ids de niveles ya completados (para ver el camino con avance). */
  completados?: string[];
}

export function crearMock(op: OpcionesMock = {}): Api & { _datos: unknown } {
  const ahora = op.ahora ?? (() => Date.now());
  const usuarios: Record<string, string> = { "demo@pixtart.mx": "contrasena123", ...op.usuarios };
  let keys: T.ApiKey[] = op.conKey === false ? [] : [
    { id: 1, proveedor: "anthropic", modelo: "claude-sonnet", ultimos4: "a1B2", estado: "activa", creada: "2026-11-20T10:00:00Z" },
  ];
  let limites: T.Limites = { tope_diario_tokens: 200000, tope_mensual_tokens: 3000000, usados_hoy: 12340, usados_mes: 410200 };
  const cursos = new Map<string, T.Curso>([["1", cursoEjemplo()], ["2", cursoBorrador()]]);
  const creados: Record<string, string> = { "1": "2026-11-20T10:00:00Z", "2": "2026-11-23T10:00:00Z" };
  const trabajos = new Map<string, { pasos: number; cursoId?: string }>();
  const completados = new Set<string>(op.completados ?? []);
  const estado: T.Estado = {
    xp_total_por_tema: { biologia: 640, matematicas: 120 },
    tier_por_tema: { biologia: 2, matematicas: 1 },
    xp_color: 320,
    paleta_activa: "pradera",
    paletas_desbloqueadas: ["gris", "pradera", "oceano"],
    monedas: 480,
    escudos: 1,
    racha: 3,
    vidas: 10,
    mascota: { id: 1, especie: "mini-golem", rareza: "rara", viva: true, revive_en: null, comida: 4, hambrienta: false, ayudas_restantes_nivel: 2, xp: 0, etapa: 1, xp_siguiente: 60, racha_sin_ayuda: 0 },
    inventario: [
      { item_id: "botiquin", cantidad: 1 },
      { item_id: "comida", cantidad: 2 },
      { item_id: "pocion_resurreccion", cantidad: 1 },
      { item_id: "mascota_crystal-owl", cantidad: 1 },
      // v0.3 (F2): equipables poseídos (cantidad 1; se quedan en el inventario aunque estén puestos).
      { item_id: "arma_espada", cantidad: 1 },
      { item_id: "ropa_tunica_verde", cantidad: 1 },
    ],
    equipo: { arma: null, armadura: null, ropa: null },
    evoluciones_mascotas: {
      "mascota_mini-golem": { xp: 0, etapa: 1, xp_siguiente: 60 },
      "mascota_crystal-owl": { xp: 75, etapa: 2, xp_siguiente: 200 },
    },
    ...op.estado,
  };
  const tienda: T.ArticuloTienda[] = [
    { item_id: "botiquin", nombre: "Botiquín", rareza: "comun", precio: 400, clase: "consumible" },
    { item_id: "comida", nombre: "Comida de mascota", rareza: "comun", precio: 250, clase: "consumible" },
    { item_id: "escudo", nombre: "Escudo de color", rareza: "comun", precio: 150, clase: "consumible" },
    { item_id: "pocion_resurreccion", nombre: "Poción de resurrección", rareza: "rara", precio: 1500, clase: "consumible" },
    { item_id: "mascota_mini-golem", nombre: "Mini gólem", rareza: "rara", precio: 3000, clase: "mascota" },
    { item_id: "mascota_ember-fox", nombre: "Zorro de brasas", rareza: "legendaria", precio: 6000, clase: "mascota" },
    // v0.3 (F2): equipables. Precio por rareza como el resto (común 400, rara 1500, legendaria 6000).
    { item_id: "arma_espada", nombre: "Espada", rareza: "comun", precio: 400, clase: "arma" },
    { item_id: "arma_arco", nombre: "Arco", rareza: "comun", precio: 400, clase: "arma" },
    { item_id: "arma_baculo", nombre: "Báculo", rareza: "rara", precio: 1500, clase: "arma" },
    { item_id: "arma_martillo", nombre: "Martillo", rareza: "rara", precio: 1500, clase: "arma" },
    { item_id: "arma_katana", nombre: "Katana", rareza: "legendaria", precio: 6000, clase: "arma" },
    { item_id: "armadura_cuero", nombre: "Armadura de cuero", rareza: "comun", precio: 400, clase: "armadura" },
    { item_id: "armadura_malla", nombre: "Cota de malla", rareza: "rara", precio: 1500, clase: "armadura" },
    { item_id: "armadura_placas", nombre: "Armadura de placas", rareza: "legendaria", precio: 6000, clase: "armadura" },
    { item_id: "ropa_tunica_verde", nombre: "Túnica verde", rareza: "comun", precio: 400, clase: "ropa" },
    { item_id: "ropa_capa_roja", nombre: "Capa roja", rareza: "comun", precio: 400, clase: "ropa" },
    { item_id: "ropa_traje_mago", nombre: "Traje de mago", rareza: "rara", precio: 1500, clase: "ropa" },
    { item_id: "ropa_manto_real", nombre: "Manto real", rareza: "legendaria", precio: 6000, clase: "ropa" },
  ];
  // v0.3 (F2): mascotas y equipables se poseen una sola vez.
  const esUnico = (id: string) => /^(mascota|arma|armadura|ropa)_/.test(id);
  const posee = (id: string) =>
    estado.inventario.some((i) => i.item_id === id && i.cantidad > 0) || (estado.mascota ? `mascota_${estado.mascota.especie}` === id : false);
  let cofresAbiertos = 0;
  const intentos = new Map<string, { nivelId: string; preguntas: T.Pregunta[]; aciertos: number; fallos: number; calentamiento: boolean; ayudasUsadas: Set<string> }>();
  // v0.3 (F1): partidas en curso por nivel (pausa/reanudar), niveles no aprobados y evolución de la mascota.
  const juego03 = { enCurso: new Map<string, { iid: string; respondidas: { pregunta_id: Id; correcta: boolean; xp_ganada: number }[]; relojDesde: number; consumidoMs: number; pausada: boolean; ayudasAntes: number }>(), noAprobados: new Set<string>(), racha: 0 };

  const buscarNivel = (nivelId: Id) => {
    for (const c of cursos.values())
      for (const s of c.secciones) for (const n of s.niveles) if (String(n.id) === String(nivelId)) return { c, s, n };
    return null;
  };
  const buscarPregunta = (cursoId: Id, pid: Id) => {
    const c = cursos.get(String(cursoId));
    if (!c) throw new ErrorApi(404, "Curso no encontrado.");
    for (const s of c.secciones)
      for (const n of s.niveles) {
        const i = n.preguntas.findIndex((q) => String(q.id) === String(pid));
        if (i >= 0) return { c, n, i };
      }
    throw new ErrorApi(404, "Pregunta no encontrada.");
  };
  const revisarRevivir = () => {
    const m = estado.mascota;
    if (m && !m.viva && m.revive_en && Date.parse(m.revive_en) <= ahora()) {
      m.viva = true;
      m.revive_en = null;
      estado.vidas = 10;
    }
  };
  const ok = <X>(x: X): Promise<X> => Promise.resolve(clonar(x));
  const quitar = (id: string) => {
    const e = estado.inventario.find((i) => i.item_id === id);
    if (!e || e.cantidad <= 0) throw new ErrorApi(409, "No tienes ese objeto.");
    e.cantidad -= 1;
    estado.inventario = estado.inventario.filter((i) => i.cantidad > 0);
  };

  const corregir = (q: T.Pregunta, r: T.RespuestaPregunta | null): boolean => {
    if (r === null || r === undefined) return false;
    switch (q.tipo) {
      case "multiple_choice":
      case "true_false":
        return r === q.respuesta;
      case "fill_text":
      case "fill_code":
        return (q.respuesta as string[]).some((a) => a.trim().toLowerCase() === String(r).trim().toLowerCase());
      case "numeric":
        return Math.abs(Number(r) - Number(q.respuesta)) <= (q.tolerancia ?? 0);
      case "ordering":
        return JSON.stringify(r) === JSON.stringify(q.respuesta);
      default:
        return r === true; // autoevaluación
    }
  };

  const api: Api = {
    async registro(e) {
      if (usuarios[e.correo]) throw new ErrorApi(409, "Ese correo ya está registrado.");
      const n = new Date(e.fecha_nacimiento);
      const edad = (ahora() - n.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (edad < 18) throw new ErrorApi(422, "Debes ser mayor de 18 años.");
      usuarios[e.correo] = e.contrasena;
      return { id: nuevoId(), correo: e.correo };
    },
    async login(e) {
      if (usuarios[e.correo] !== e.contrasena) throw new ErrorApi(401, "Correo o contraseña incorrectos.");
      return { token: "token-falso-" + e.correo, usuario: { id: 1, correo: e.correo } };
    },
    yo: () => ok({ id: 1, correo: "demo@pixtart.mx", zona_horaria: "America/Mexico_City" }),

    listarKeys: () => ok(keys),
    async crearKey(e) {
      if (!e.api_key.startsWith("sk-ant-")) throw new ErrorApi(400, "La key no es válida: Anthropic la rechazó.");
      const k: T.ApiKey = { id: nuevoId(), proveedor: "anthropic", modelo: e.modelo ?? null, ultimos4: e.api_key.slice(-4), estado: "activa", creada: new Date(ahora()).toISOString() };
      keys = [k];
      return clonar(k);
    },
    async borrarKey(id) {
      keys = keys.filter((k) => String(k.id) !== String(id));
    },
    obtenerLimites: () => ok(limites),
    async guardarLimites(e) {
      limites = { ...limites, ...e };
      return clonar(limites);
    },

    async crearCurso(pdfs, config) {
      if (!keys.length) throw new ErrorApi(400, "Conecta tu API key antes de crear un curso.");
      const problema = problemaLista(pdfs);
      if (problema) throw new ErrorApi(422, problema);
      const c = cursoBorrador();
      c.id = nuevoId();
      c.titulo = config.titulo || pdfs[0].name.replace(/\.pdf$/i, "");
      // como el backend: cada pregunta cita el PDF del que sale (aquí, por turnos)
      let k = 0;
      for (const s of c.secciones) for (const n of s.niveles) for (const q of n.preguntas) q.fuente_documento = pdfs[k++ % pdfs.length].name;
      cursos.set(String(c.id), c);
      creados[String(c.id)] = new Date(ahora()).toISOString();
      const tid = nuevoId();
      trabajos.set(String(tid), { pasos: 0, cursoId: String(c.id) });
      return { curso_id: c.id, trabajo_id: tid };
    },
    async trabajo(id) {
      const t = trabajos.get(String(id)) ?? { pasos: ESTADOS_TRABAJO.length };
      t.pasos = Math.min(t.pasos + 1, ESTADOS_TRABAJO.length - 1);
      trabajos.set(String(id), t);
      const est = ESTADOS_TRABAJO[t.pasos];
      return { id, estado: est, progreso: Math.round((t.pasos / (ESTADOS_TRABAJO.length - 1)) * 100), mensaje: `Paso ${t.pasos + 1} de ${ESTADOS_TRABAJO.length}`, error: null };
    },
    listarCursos: () =>
      ok([...cursos.values()].map((c) => ({ id: c.id, titulo: c.titulo, estado: c.estado, tema: c.tema, creado: creados[String(c.id)] }))),
    async curso(id) {
      const c = cursos.get(String(id));
      if (!c) throw new ErrorApi(404, "Curso no encontrado.");
      return clonar(c);
    },
    async editarPregunta(cid, pid, cambios) {
      const { n, i } = buscarPregunta(cid, pid);
      n.preguntas[i] = { ...n.preguntas[i], ...cambios, valida: true, problemas: [] };
      return clonar(n.preguntas[i]);
    },
    async borrarPregunta(cid, pid) {
      const { n, i } = buscarPregunta(cid, pid);
      n.preguntas.splice(i, 1);
    },
    async regenerarPregunta(cid, pid, instruccion) {
      const { n, i } = buscarPregunta(cid, pid);
      n.preguntas[i] = { ...n.preguntas[i], enunciado: n.preguntas[i].enunciado + (instruccion ? ` (${instruccion})` : " (regenerada)"), valida: true, problemas: [] };
      const tid = nuevoId();
      trabajos.set(String(tid), { pasos: ESTADOS_TRABAJO.length - 2 });
      return { trabajo_id: tid };
    },
    async publicar(cid) {
      const c = cursos.get(String(cid));
      if (!c) throw new ErrorApi(404, "Curso no encontrado.");
      if (c.secciones.some((s) => s.niveles.some((n) => n.preguntas.some((q) => !q.valida))))
        throw new ErrorApi(409, "Hay preguntas que no pasan la validación.");
      c.estado = "publicado";
      return { id: c.id, estado: "publicado" as const };
    },

    async estado() {
      revisarRevivir();
      return clonar(estado);
    },
    async camino(cid) {
      const c = cursos.get(String(cid));
      if (!c) throw new ErrorApi(404, "Curso no encontrado.");
      let actualPuesto = false;
      let cuenta = 0;
      return {
        secciones: c.secciones.map((s) => {
          const niveles: T.NodoCamino[] = [];
          s.niveles.forEach((n) => {
            let est: T.EstadoNodo = "bloqueado";
            if (completados.has(String(n.id))) est = "completado";
            else if (!actualPuesto) {
              est = "actual";
              actualPuesto = true;
            }
            niveles.push({ id: n.id, titulo: n.titulo, estado: est, tipo: n.es_calentamiento ? "calentamiento" : "leccion" });
            cuenta++;
            if (cuenta % 5 === 0 || n === s.niveles[s.niveles.length - 1])
              niveles.push({ id: `cofre-${n.id}`, titulo: "Cofre", estado: est === "completado" ? "completado" : "bloqueado", tipo: "cofre" });
          });
          // Nivel final de la sección (mejora 8): bloqueado hasta completar todos sus niveles. El mock no
          // tiene servidor del jefe, así que lleva el id "demo": /final/demo juega con `nivel-final/demo.ts`.
          const hecha = s.niveles.length > 0 && s.niveles.every((n) => completados.has(String(n.id)));
          niveles.push({ id: "demo", titulo: `Nivel final: ${s.titulo}`, estado: hecha ? "disponible" : "bloqueado", tipo: "final" });
          return { id: s.id, titulo: s.titulo, niveles };
        }),
      };
    },
    async iniciarNivel(nid) {
      const r = buscarNivel(nid);
      if (!r) throw new ErrorApi(404, "Nivel no encontrado.");
      revisarRevivir();
      const jugables = (qs: T.Pregunta[]) => qs.map((q) => {
        const { respuesta: _r, valida: _v, problemas: _p, ...resto } = q;
        void _r; void _v; void _p;
        const jug: T.PreguntaJugable = { ...resto };
        if (!["open", "math_problem", "proof"].includes(q.tipo)) delete jug.explicacion;
        return jug;
      });
      // v0.3: si hay una partida en curso de ESTE nivel, se retoma con el tiempo que le quedaba.
      const previa = juego03.enCurso.get(String(nid));
      const itPrevio = previa && intentos.get(previa.iid);
      if (previa && itPrevio) {
        const actual = itPrevio.preguntas[previa.respondidas.length];
        const restante_s = actual ? Math.max(0, Math.round(actual.tiempo_s - previa.consumidoMs / 1000)) : 0;
        previa.pausada = false;
        previa.relojDesde = ahora();
        return {
          intento_id: Number(previa.iid),
          preguntas: jugables(itPrevio.preguntas),
          reanudado: true,
          progreso: { respondidas: clonar(previa.respondidas), restante_s, xp_ganada: previa.respondidas.reduce((s, x) => s + x.xp_ganada, 0) },
        };
      }
      if (estado.mascota) estado.mascota.ayudas_restantes_nivel = { comun: 1, rara: 2, legendaria: 3 }[estado.mascota.rareza];
      const reintento = juego03.noAprobados.has(String(nid)) && !completados.has(String(nid));
      // Reintento: el mock solo tiene las preguntas del nivel (último recurso), pero las sirve en otro orden.
      const qs = reintento ? [...r.n.preguntas].reverse() : r.n.preguntas;
      const iid = nuevoId();
      intentos.set(String(iid), { nivelId: String(nid), preguntas: qs, aciertos: 0, fallos: 0, calentamiento: r.n.es_calentamiento, ayudasUsadas: new Set() });
      juego03.enCurso.set(String(nid), { iid: String(iid), respondidas: [], relojDesde: ahora(), consumidoMs: 0, pausada: false, ayudasAntes: estado.mascota?.ayudas_restantes_nivel ?? 0 });
      return { intento_id: iid, preguntas: jugables(qs), ...(reintento ? { reintento: true } : {}) };
    },
    async responder(iid, e) {
      const it = intentos.get(String(iid));
      if (!it) throw new ErrorApi(404, "Intento no encontrado.");
      const q = it.preguntas.find((x) => String(x.id) === String(e.pregunta_id));
      if (!q) throw new ErrorApi(404, "Pregunta no encontrada.");
      revisarRevivir();
      const correcta = corregir(q, e.respuesta);
      if (correcta) it.aciertos++;
      else {
        it.fallos++;
        if (!it.calentamiento && estado.mascota?.viva) {
          estado.vidas = Math.max(0, estado.vidas - 1);
          if (estado.vidas === 0) {
            estado.mascota.viva = false;
            estado.mascota.revive_en = new Date(ahora() + 20 * 60 * 1000).toISOString();
          }
        }
      }
      const xp = correcta ? 10 : 0;
      // v0.3: progreso de la partida (para pausar/reanudar) y evolución de la mascota.
      const ec = juego03.enCurso.get(it.nivelId);
      const m = estado.mascota;
      let mascota_evento: T.EventoMascota | null = null;
      if (m?.viva) {
        const usoAyuda = ec ? m.ayudas_restantes_nivel < ec.ayudasAntes : false;
        const antes = m.etapa ?? 1;
        let ganada = 0;
        if (correcta && !usoAyuda) {
          juego03.racha += 1;
          ganada = 2 + Math.min(3, Math.floor(juego03.racha / 3));
        } else juego03.racha = 0;
        m.xp = (m.xp ?? 0) + ganada;
        m.racha_sin_ayuda = juego03.racha;
        m.etapa = m.xp >= 200 ? 3 : m.xp >= 60 ? 2 : 1;
        m.xp_siguiente = m.etapa === 3 ? null : m.etapa === 2 ? 200 : 60;
        mascota_evento = { xp_ganada: ganada, evoluciono: m.etapa > antes, etapa: m.etapa };
      }
      if (ec && ec.iid === String(iid)) {
        ec.respondidas.push({ pregunta_id: q.id, correcta, xp_ganada: xp });
        ec.relojDesde = ahora();
        ec.consumidoMs = 0;
        ec.ayudasAntes = m?.ayudas_restantes_nivel ?? 0;
      }
      return clonar({ correcta, respuesta_correcta: q.respuesta, explicacion: q.explicacion, vidas: estado.vidas, mascota: estado.mascota, xp_ganada: xp, mascota_evento });
    },
    async ayuda(iid, pid) {
      const it = intentos.get(String(iid));
      const m = estado.mascota;
      if (!it || !m || !m.viva || m.ayudas_restantes_nivel <= 0) throw new ErrorApi(409, "No hay ayuda disponible.");
      const q = it.preguntas.find((x) => String(x.id) === String(pid));
      if (!q) throw new ErrorApi(404, "Pregunta no encontrada.");
      let r: T.Ayuda;
      if (q.tipo === "multiple_choice") {
        const malas = (q.opciones ?? []).map((_, i) => i).filter((i) => i !== q.respuesta);
        r = { tipo_ayuda: "eliminar_opcion", datos: { eliminar_opcion: malas[0] } };
      } else if (q.tipo === "true_false") r = { tipo_ayuda: "eliminar_opcion", datos: { eliminar_opcion: q.respuesta ? 0 : 1 } };
      else if (q.tipo === "fill_text" || q.tipo === "fill_code") r = { tipo_ayuda: "revelar", datos: { revelar: (q.respuesta as string[])[0].slice(0, 3) } };
      else if (q.tipo === "numeric") { const v = Number(q.respuesta); r = { tipo_ayuda: "intervalo", datos: { intervalo: [v - 5, v + 5] } }; }
      else if (q.tipo === "ordering") r = { tipo_ayuda: "fijar_paso", datos: { fijar_paso: { posicion: 0, indice: (q.respuesta as number[])[0] } } };
      else if (m.rareza === "legendaria") r = { tipo_ayuda: "pista", datos: { pista: q.pista ?? "Piensa en la idea central de la sección." } };
      else throw new ErrorApi(409, "Tu mascota no puede ayudar en este tipo de pregunta.");
      m.ayudas_restantes_nivel -= 1;
      m.comida = Math.max(0, m.comida - 1);
      m.hambrienta = m.comida === 0;
      return r;
    },
    async terminar(iid) {
      const it = intentos.get(String(iid));
      if (!it) throw new ErrorApi(404, "Intento no encontrado.");
      if (juego03.enCurso.get(it.nivelId)?.iid === String(iid)) juego03.enCurso.delete(it.nivelId);
      // v0.3: mínimo de aciertos. Si no se alcanza, el nivel no se completa (sin cofre, drop ni vida).
      // Los calentamientos no exigen mínimo.
      const esCalentamiento = [...cursos.values()].some((c) => c.secciones.some((s) => s.niveles.some((n) => String(n.id) === it.nivelId && n.es_calentamiento)));
      const minimo = esCalentamiento ? 0 : estado.minimo_aprobar ?? 60;
      const porcentaje = Math.round((100 * it.aciertos) / Math.max(1, it.preguntas.length));
      const aprobado = porcentaje >= minimo;
      if (!aprobado) {
        juego03.noAprobados.add(it.nivelId);
        const xpRes = it.aciertos * 10;
        estado.monedas += 7;
        estado.xp_color = Math.min(3000, estado.xp_color + xpRes);
        return { xp_ganada: xpRes, monedas: 7, perfecto: false, vidas: estado.vidas, drop: null, cofre: null, aprobado, porcentaje, minimo };
      }
      juego03.noAprobados.delete(it.nivelId);
      const repetido = completados.has(it.nivelId);
      completados.add(it.nivelId);
      const perfecto = it.fallos === 0;
      const xp = it.aciertos * 10 + 20 + (perfecto ? 30 : 0);
      const monedas = repetido ? 7 : 25;
      estado.monedas += monedas;
      estado.xp_color = Math.min(3000, estado.xp_color + xp);
      if (estado.mascota?.viva) estado.vidas = Math.min(10, estado.vidas + 1);
      return { xp_ganada: xp, monedas, perfecto, vidas: estado.vidas, drop: perfecto ? { item_id: "comida", nombre: "Comida de mascota", rareza: "comun" as const } : null, cofre: completados.size % 3 === 0 ? { id: nuevoId(), tipo: "normal" as const } : null, aprobado, porcentaje, minimo };
    },
    async abrirCofre() {
      // v0.3 (mejora 7): sin ítems repetidos dentro del cofre y sin únicos que ya poseas;
      // si no queda candidato para un hueco, se paga en monedas. Rotación determinista (sin Math.random).
      cofresAbiertos += 1;
      const candidatos = tienda.filter((a) => a.item_id !== "escudo" && !(esUnico(a.item_id) && posee(a.item_id)));
      const items: T.Item[] = [];
      let monedas = 60;
      for (let hueco = 0; hueco < 2; hueco++) {
        const libres = candidatos.filter((a) => !items.some((i) => i.item_id === a.item_id));
        if (libres.length === 0) { monedas += 100; continue; }
        const a = libres[(cofresAbiertos * 7 + hueco * 3) % libres.length];
        items.push({ item_id: a.item_id, nombre: a.nombre, rareza: a.rareza, cantidad: 1 });
        const e = estado.inventario.find((i) => i.item_id === a.item_id);
        if (e) e.cantidad += esUnico(a.item_id) ? 0 : 1;
        else estado.inventario.push({ item_id: a.item_id, cantidad: 1 });
      }
      estado.monedas += monedas;
      return { items, monedas };
    },
    tienda: () => ok(tienda),
    async comprar(itemId) {
      const a = tienda.find((t) => t.item_id === itemId);
      if (!a) throw new ErrorApi(404, "Ese objeto no está a la venta.");
      if (esUnico(itemId) && posee(itemId)) throw new ErrorApi(409, "Ya tienes ese artículo.");
      if (estado.monedas < a.precio) throw new ErrorApi(409, "No te alcanzan las monedas.");
      estado.monedas -= a.precio;
      if (itemId === "escudo") estado.escudos = Math.min(2, estado.escudos + 1);
      else {
        const e = estado.inventario.find((i) => i.item_id === itemId);
        if (e) e.cantidad++;
        else estado.inventario.push({ item_id: itemId, cantidad: 1 });
      }
      return { monedas: estado.monedas, inventario: clonar(estado.inventario) };
    },
    async usarItem(itemId) {
      revisarRevivir();
      const m = estado.mascota;
      if (itemId === "botiquin") {
        if (!m?.viva) throw new ErrorApi(409, "El botiquín solo cura a una mascota viva.");
        quitar(itemId);
        estado.vidas = 10;
      } else if (itemId === "pocion_resurreccion") {
        if (!m || m.viva) throw new ErrorApi(409, "Tu mascota no necesita revivir.");
        quitar(itemId);
        m.viva = true;
        m.revive_en = null;
        estado.vidas = 10;
      } else if (itemId === "comida") {
        if (!m) throw new ErrorApi(409, "No tienes mascota.");
        quitar(itemId);
        m.comida += 5;
        m.hambrienta = false;
      } else if (itemId === "escudo") {
        quitar(itemId);
        estado.escudos = Math.min(2, estado.escudos + 1);
      } else throw new ErrorApi(409, "Ese objeto no se puede usar.");
      return clonar(estado);
    },
    async equiparMascota(mid) {
      const id = String(mid);
      const especie = id.replace(/^mascota_/, "");
      const rareza: T.Rareza = ["ember-fox", "crystal-owl", "onyx-dragon"].includes(especie) ? "legendaria" : ["mini-golem", "book-golem"].includes(especie) ? "rara" : "comun";
      if (estado.mascota) {
        const prev = `mascota_${estado.mascota.especie}`;
        const e = estado.inventario.find((i) => i.item_id === prev);
        if (e) e.cantidad++;
        else estado.inventario.push({ item_id: prev, cantidad: 1 });
      }
      quitar(id);
      const evos = (estado.evoluciones_mascotas ??= {});
      if (estado.mascota) {
        const m = estado.mascota;
        evos[`mascota_${m.especie}`] = { xp: m.xp ?? 0, etapa: m.etapa ?? 1, xp_siguiente: m.xp_siguiente ?? 60 };
      }
      const ev = evos[id] ?? { xp: 0, etapa: 1 as const, xp_siguiente: 60 };
      evos[id] = ev;
      const cupo = { comun: 1, rara: 2, legendaria: 3 }[rareza] + (ev.etapa === 3 ? 1 : 0);
      estado.mascota = { id: nuevoId(), especie, rareza, viva: true, revive_en: null, comida: 3, hambrienta: false, ayudas_restantes_nivel: cupo,
        xp: ev.xp, etapa: ev.etapa, xp_siguiente: ev.xp_siguiente, racha_sin_ayuda: 0 };
      return clonar(estado);
    },
    async elegirPaleta(pid) {
      if (!estado.paletas_desbloqueadas.includes(pid)) throw new ErrorApi(409, "Esa paleta aún está bloqueada.");
      estado.paleta_activa = pid;
      return clonar(estado);
    },
    // ---- v0.3 (stubs mínimos; cada función los afina) ----
    async pausar(iid) {
      // Congela el reloj de la pregunta en curso; `iniciarNivel` de ese nivel la retoma.
      for (const ec of juego03.enCurso.values()) {
        if (ec.iid !== String(iid) || ec.pausada) continue;
        ec.consumidoMs += Math.max(0, ahora() - ec.relojDesde);
        ec.pausada = true;
      }
    },
    async equipar(itemId) {
      const eq = (estado.equipo ??= { arma: null, armadura: null, ropa: null });
      const ranura = itemId.startsWith("arma_") ? "arma" : itemId.startsWith("armadura_") ? "armadura" : itemId.startsWith("ropa_") ? "ropa" : null;
      if (!ranura) throw new ErrorApi(409, "Ese artículo no se equipa.");
      if (!estado.inventario.some((i) => i.item_id === itemId && i.cantidad > 0)) throw new ErrorApi(409, "No tienes ese artículo.");
      eq[ranura] = itemId;
      return clonar(estado);
    },
    async desequipar(ranura) {
      const eq = (estado.equipo ??= { arma: null, armadura: null, ropa: null });
      eq[ranura] = null;
      return clonar(estado);
    },
    async guardarAjustesJuego(e) {
      estado.minimo_aprobar = Math.max(0, Math.min(100, Math.round(e.minimo_aprobar)));
      return clonar(estado);
    },
  };
  return Object.assign(api, { _datos: { cursos, estado } });
}
