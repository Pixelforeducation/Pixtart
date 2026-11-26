/**
 * Música de fondo chiptune, original y sintetizada con Web Audio (sin archivos de audio ni derechos de
 * terceros). Una pista en bucle por bioma (fondo) más la del jefe ("final"); cada una con su tonalidad,
 * tempo, instrumentación (onda de la melodía y del bajo, flauta con vibrato, arpegios, eco) y percusión.
 *
 *   musica.reproducir("mapa" | "nivel" | "final" | <bioma>)  · musica.detener()
 *     "mapa"  → pista del bioma del mapa (lo fija Inicio con `setBioma(b)`, def. pradera)
 *     "nivel" → la del bioma del nivel (`setBioma(b, "nivel")`), más rápida y con más percusión
 *     <bioma> → esa pista directamente (tienda, perfil…), sin cambiar el bioma del mapa
 *   musica.reproducirBioma(b, modo?)  = setBioma(b, modo) + reproducir(modo)
 *   musica.activa() / musica.setActiva(b)     → se guarda en localStorage ("pixtart:musica")
 *   musica.volumen() / musica.setVolumen(v)   → 0..1, def. 0.25 ("pixtart:musica:vol")
 *
 * - Activa por defecto, volumen bajo.
 * - Autoplay: no suena hasta el primer gesto del usuario (toque/tecla); entonces arranca la pista pedida.
 * - Se pausa con la pestaña oculta y sigue al volver.
 * - El silencio global de efectos (`efectos/sonido.ts`, botón del HUD y Ajustes) también la calla:
 *   se consulta en cada vuelta del secuenciador, así no hace falta tocar ese módulo.
 * - El nivel final no tiene bucle propio: `nivel-final/audio.ts` delega aquí (pista "final" + `setFuria`).
 * Nada de esto lanza: sin Web Audio (tests, navegadores viejos) todo es un no-op.
 */
import { useSyncExternalStore } from "react";
import { sonidoActivo } from "../efectos/sonido";
import type { Bioma } from "./index";

export type ModoPista = "mapa" | "nivel";
/** Lo que se puede pedir: un modo ("mapa"/"nivel", según el bioma fijado), el jefe o un bioma concreto. */
export type Pista = ModoPista | "final" | Bioma;
/** Partitura que suena de verdad: una por bioma más la del jefe. */
export type Tema = Bioma | "final";

const CLAVE = "pixtart:musica";
const CLAVE_VOL = "pixtart:musica:vol";
export const VOLUMEN_MUSICA_DEF = 0.25;

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}
function escribir(clave: string, v: string) {
  try {
    localStorage.setItem(clave, v);
  } catch {
    /* almacenamiento bloqueado: vale solo para esta sesión */
  }
}
const recortar = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : VOLUMEN_MUSICA_DEF));

// ------------------------------------------------------------------ partituras (originales)
// Una casilla = una corchea. "." silencio, "-" prolonga la nota anterior. 8 compases de 8 corcheas.
export interface Partitura {
  bpm: number;
  melodia: string;
  raices: string; // una nota de bajo por compás
  bajo: number[]; // patrón de 8 corcheas: semitonos sobre la raíz (-1 = silencio)
  bateria: string; // patrón de 8 corcheas: k bombo, s caja, h charles, . nada
  /** Instrumentación. */
  timbre: {
    lider: OscillatorType;
    bajo: OscillatorType;
    /** Volumen de la melodía (def. 0.07). */
    vol?: number;
    /** Fracción de la nota que suena (def. 0.92; menos = staccato). */
    legato?: number;
    /** Vibrato de la melodía en fracción de la frecuencia (flauta). */
    vibrato?: number;
  };
  /** Arpegio de acompañamiento: 8 corcheas, semitonos sobre la raíz + 2 octavas (-1 = silencio). */
  arpegio?: number[];
  /** Eco: retardo en segundos, realimentación y cuánto se envía (0..1). */
  eco?: { s: number; fb: number; envio: number };
}

export const PISTAS: Readonly<Record<Tema, Partitura>> = {
  // Pradera: alegre y saltarina, Do mayor.
  pradera: {
    bpm: 112,
    melodia: `
      E5 - G5 C6 B5 - G5 -   A5 - G5 E5 F5 E5 D5 -
      E5 - G5 C6 D6 - C6 B5  A5 - - - G5 - . .
      F5 - A5 C6 B5 - G5 -   E5 - G5 E5 D5 C5 D5 -
      E5 G5 F5 D5 C5 - E5 D5 C5 - - - . . . .`,
    raices: "C3 A2 F2 G2 F2 C3 G2 C3",
    bajo: [0, -1, 12, -1, 0, -1, 7, -1],
    bateria: "k.h.s.h.",
    timbre: { lider: "square", bajo: "triangle" },
  },
  // Bosque: flauta con vibrato sobre arpegios de campanita, Sol mayor.
  bosque: {
    bpm: 100,
    melodia: `
      D5 - B4 D5 G5 - F#5 E5   D5 - - B4 C5 - A4 -
      B4 - D5 G5 A5 - G5 F#5   E5 - - - D5 - . .
      C5 - E5 A5 G5 - E5 C5    B4 - D5 G5 F#5 - D5 -
      E5 - C5 A4 D5 - F#5 -    G5 - - - . . . .`,
    raices: "G2 D2 G2 C2 A2 G2 D2 G2",
    bajo: [0, -1, 7, -1, 12, -1, 7, -1],
    bateria: "k..hs..h",
    timbre: { lider: "sine", bajo: "triangle", vol: 0.1, vibrato: 0.007 },
    arpegio: [0, 7, 12, 7, 0, 7, 12, 7],
  },
  // Biblioteca: lenta y tranquila, cajita de música, Fa mayor.
  biblioteca: {
    bpm: 76,
    melodia: `
      A4 - - C5 F5 - E5 -    D5 - - - C5 - - -
      Bb4 - - D5 G5 - F5 -   E5 - - - . . . .
      F5 - - A5 G5 - F5 -    E5 - D5 - C5 - - -
      D5 - E5 - C5 - Bb4 -   A4 - - - . . . .`,
    raices: "F2 Bb1 G2 C2 F2 A1 C2 F2",
    bajo: [0, -1, -1, -1, 7, -1, -1, -1],
    bateria: "....h...",
    timbre: { lider: "triangle", bajo: "sine", vol: 0.08 },
    arpegio: [12, -1, 7, -1, 12, -1, 19, -1],
    eco: { s: 0.4, fb: 0.25, envio: 0.25 },
  },
  // Cueva: grave, frigia, con mucho eco (gotas que resuenan), Mi.
  cueva: {
    bpm: 84,
    melodia: `
      E4 - - G4 F4 - E4 -    . . B3 - C4 - B3 -
      E4 - - G4 A4 - G4 F4   E4 - - - . . . .
      B4 - - A4 G4 - F4 -    G4 - A4 - F4 - E4 -
      D4 - F4 - E4 - D4 C4   E4 - - - . . . .`,
    raices: "E2 E2 E2 F2 E2 D2 C2 E2",
    bajo: [0, -1, -1, 0, -1, -1, 1, -1],
    bateria: "k...k.s.",
    timbre: { lider: "triangle", bajo: "square", vol: 0.12 },
    eco: { s: 0.36, fb: 0.5, envio: 0.55 },
  },
  // Castillo: marcha de metales, Si bemol mayor.
  castillo: {
    bpm: 120,
    melodia: `
      Bb4 - - F4 Bb4 - D5 -   F5 - - D5 Bb4 - - -
      C5 - - A4 C5 - Eb5 -    D5 - - - Bb4 - . .
      D5 - - Bb4 D5 - F5 -    G5 - F5 Eb5 D5 - C5 -
      Bb4 - D5 C5 A4 - F4 -   Bb4 - - - . . . .`,
    raices: "Bb1 Bb1 F2 Bb1 Bb1 Eb2 F2 Bb1",
    bajo: [0, -1, 0, -1, 7, -1, 0, 7],
    bateria: "k.s.k.ss",
    timbre: { lider: "sawtooth", bajo: "square", vol: 0.045, legato: 0.8 },
  },
  // Noche: misteriosa, dórica, flauta lejana con eco y arpegio suave, Re.
  noche: {
    bpm: 92,
    melodia: `
      A4 - D5 - F5 - E5 D5    C5 - - - A4 - - -
      B4 - D5 - E5 - F5 E5    D5 - - - . . . .
      A5 - G5 F5 E5 - D5 -    C5 - E5 - A4 - - -
      B4 - C5 D5 E5 - C#5 -   D5 - - - . . . .`,
    raices: "D2 A1 G2 D2 D2 A1 G2 D2",
    bajo: [0, -1, -1, 7, -1, -1, 12, -1],
    bateria: "k.....h.",
    timbre: { lider: "sine", bajo: "triangle", vol: 0.09, vibrato: 0.01 },
    arpegio: [0, 7, 12, 14, 12, 7, 0, 7],
    eco: { s: 0.45, fb: 0.35, envio: 0.35 },
  },
  // Tienda: animada y en staccato, octavas en el bajo, Re mayor.
  tienda: {
    bpm: 126,
    melodia: `
      F#5 - A5 F#5 D5 - . A4   B4 - D5 - F#5 - E5 -
      E5 - G5 E5 C#5 - . A4    D5 - F#5 - A5 - . .
      B5 - A5 G5 F#5 - E5 D5   G5 - F#5 E5 D5 - B4 -
      A4 - B4 C#5 D5 - E5 -    D5 - - - . . A4 .`,
    raices: "D2 B1 A1 D2 G2 E2 A1 D2",
    bajo: [0, 12, 7, 12, 0, 12, 7, 12],
    bateria: "k.hsk.hs",
    timbre: { lider: "square", bajo: "triangle", vol: 0.06, legato: 0.55 },
  },
  // Perfil: serena y heroica, La mayor.
  perfil: {
    bpm: 104,
    melodia: `
      E5 - C#5 E5 A5 - G#5 -   F#5 - E5 - C#5 - - -
      D5 - F#5 - B5 - A5 G#5   A5 - - - E5 - . .
      C#6 - B5 A5 G#5 - F#5 -  E5 - F#5 G#5 A5 - B5 -
      C#6 - B5 - A5 - G#5 -    A5 - - - . . . .`,
    raices: "A2 F#2 D2 A2 A2 C#2 E2 A2",
    bajo: [0, -1, 7, 12, 0, -1, 7, -1],
    bateria: "k.h.s.hh",
    timbre: { lider: "square", bajo: "triangle", vol: 0.06 },
    arpegio: [0, -1, 7, -1, 12, -1, 7, -1],
  },
  // Jefe final: épica, Re menor (la furia la acelera y sube medio tono).
  final: {
    bpm: 150,
    melodia: `
      D5 - D5 F5 A5 - G5 F5    E5 - C5 - D5 - A4 -
      Bb4 - D5 F5 Bb5 - A5 G5  A5 - - - C#5 - E5 -
      D5 F5 A5 D6 C6 A5 F5 A5  Bb5 A5 G5 F5 G5 - E5 -
      F5 - E5 D5 C#5 - E5 -    D5 - - - A4 - D5 -`,
    raices: "D2 C2 Bb1 A1 D2 G2 A1 D2",
    bajo: [0, 0, 12, 0, 7, 0, 12, 7],
    bateria: "kkshkhsh",
    timbre: { lider: "square", bajo: "triangle" },
  },
};

/** Biomas con pista propia (todos los de `BIOMAS`). */
export const TEMAS = Object.keys(PISTAS) as Tema[];
const esTema = (p: string): p is Tema => Object.prototype.hasOwnProperty.call(PISTAS, p);
/** En modo "nivel" la pista va más rápida y rellena con charles los huecos de percusión. */
export const ACELERA_NIVEL = 1.12;

const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** "C#5" → número MIDI (Do central = C4 = 60). null si no es una nota. */
export function midi(nota: string): number | null {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(nota);
  if (!m) return null;
  return 12 * (Number(m[3]) + 1) + SEMI[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
}
const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface Nota { n: number; pasos: number }
/** Convierte la melodía en una lista por casilla: la nota que empieza ahí (y cuánto dura) o null. */
export function compilarMelodia(txt: string): (Nota | null)[] {
  const fichas = txt.trim().split(/\s+/);
  const out: (Nota | null)[] = fichas.map(() => null);
  let ultima: Nota | null = null;
  fichas.forEach((f, i) => {
    if (f === "-") {
      if (ultima) ultima.pasos++;
      return;
    }
    const n = f === "." ? null : midi(f);
    ultima = n === null ? null : { n, pasos: 1 };
    out[i] = ultima;
  });
  return out;
}

const COMPILADAS = Object.fromEntries(
  TEMAS.map((p) => [p, { mel: compilarMelodia(PISTAS[p].melodia), raices: PISTAS[p].raices.split(/\s+/).map((r) => midi(r) ?? 36) }]),
) as Record<Tema, { mel: (Nota | null)[]; raices: number[] }>;

// ------------------------------------------------------------------ estado
let activa = leer(CLAVE) !== "off";
let vol = (() => {
  const crudo = leer(CLAVE_VOL);
  return crudo === null ? VOLUMEN_MUSICA_DEF : recortar(Number(crudo));
})();
let pista: Pista | null = null; // lo pedido
let biomaMapa: Bioma = "pradera";
let biomaNivel: Bioma = "pradera";
let tema: Tema | null = null; // lo que suena (resuelto)
let enNivel = false;
let furia = false;
type Foto = { activa: boolean; volumen: number; pista: Pista | null; tema: Tema | null };
let foto: Foto = { activa, volumen: vol, pista, tema };
const oyentes = new Set<() => void>();
function avisar() {
  foto = { activa, volumen: vol, pista, tema };
  oyentes.forEach((f) => f());
}

/** Qué partitura corresponde a una petición, con los biomas fijados. */
export function resolverPista(p: Pista, biomas: { mapa: Bioma; nivel: Bioma } = { mapa: biomaMapa, nivel: biomaNivel }): { tema: Tema; nivel: boolean } {
  if (p === "mapa") return { tema: biomas.mapa, nivel: false };
  if (p === "nivel") return { tema: biomas.nivel, nivel: true };
  return { tema: esTema(p) ? p : "pradera", nivel: false };
}

let ctx: AudioContext | null = null;
let maestro: GainNode | null = null;
let ecoEntrada: GainNode | null = null;
let ecoRetardo: DelayNode | null = null;
let ecoVuelta: GainNode | null = null;
let ruidoBuf: AudioBuffer | null = null;
let reloj: ReturnType<typeof setInterval> | null = null;
let paso = 0;
let siguiente = 0;
let gesto = false; // ya hubo un gesto del usuario (política de autoplay)

function oculta(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function ajustarEco() {
  if (!ctx || !ecoRetardo || !ecoVuelta) return;
  const e = tema ? PISTAS[tema].eco : undefined;
  try {
    ecoRetardo.delayTime.setValueAtTime(e?.s ?? 0.3, ctx.currentTime);
    ecoVuelta.gain.setValueAtTime(e?.fb ?? 0, ctx.currentTime);
  } catch {
    /* nada */
  }
}

function contexto(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === "undefined") return null;
  const C: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  try {
    ctx = new C();
    maestro = ctx.createGain();
    maestro.gain.value = vol * 0.5;
    maestro.connect(ctx.destination);
    // Eco (cueva, noche, biblioteca): entrada → retardo ⇄ realimentación → maestro.
    try {
      ecoEntrada = ctx.createGain();
      ecoRetardo = ctx.createDelay(1);
      ecoVuelta = ctx.createGain();
      ecoVuelta.gain.value = 0;
      ecoEntrada.connect(ecoRetardo);
      ecoRetardo.connect(ecoVuelta).connect(ecoRetardo);
      ecoRetardo.connect(maestro);
      ajustarEco();
    } catch {
      ecoEntrada = ecoRetardo = ecoVuelta = null;
    }
    const n = Math.floor(ctx.sampleRate * 0.25);
    ruidoBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = ruidoBuf.getChannelData(0);
    let semilla = 12345; // ruido determinista (LCG), sin el Math.random global
    for (let i = 0; i < n; i++) {
      semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (semilla / 0x7fffffff) * 2 - 1;
    }
  } catch {
    ctx = null;
    maestro = null;
  }
  return ctx;
}

interface Extra { f1?: number; vibrato?: number; envio?: number }
function nota(c: AudioContext, f: number, t: number, dur: number, tipo: OscillatorType, v: number, x: Extra = {}) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = tipo;
  o.frequency.setValueAtTime(f, t);
  if (x.f1) o.frequency.exponentialRampToValueAtTime(x.f1, t + dur);
  if (x.vibrato && dur > 0.15) {
    const lfo = c.createOscillator();
    const prof = c.createGain();
    lfo.frequency.value = 5.5;
    prof.gain.setValueAtTime(0, t);
    prof.gain.linearRampToValueAtTime(f * x.vibrato, t + Math.min(0.25, dur * 0.5));
    lfo.connect(prof).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.02);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.008);
  g.gain.setValueAtTime(v, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(maestro!);
  if (x.envio && ecoEntrada) {
    const e = c.createGain();
    e.gain.value = x.envio;
    g.connect(e).connect(ecoEntrada);
  }
  o.start(t);
  o.stop(t + dur + 0.02);
}

function golpe(c: AudioContext, t: number, dur: number, v: number, tipo: BiquadFilterType, frec: number, envio = 0) {
  if (!ruidoBuf) return;
  const s = c.createBufferSource();
  s.buffer = ruidoBuf;
  const fl = c.createBiquadFilter();
  fl.type = tipo;
  fl.frequency.value = frec;
  const g = c.createGain();
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(maestro!);
  if (envio && ecoEntrada) {
    const e = c.createGain();
    e.gain.value = envio;
    g.connect(e).connect(ecoEntrada);
  }
  s.start(t);
  s.stop(t + dur + 0.02);
}

/** Golpe de percusión de la casilla `i` (en modo nivel los huecos a contratiempo llevan charles). */
export function golpeDe(bateria: string, i: number, nivel: boolean): string {
  const ch = bateria[i % bateria.length] ?? ".";
  return nivel && ch === "." && i % 2 === 1 ? "h" : ch;
}

function programarPaso(c: AudioContext, p: Tema, i: number, t: number, corchea: number) {
  const part = PISTAS[p];
  const { mel, raices } = COMPILADAS[p];
  const tb = part.timbre;
  const envio = part.eco?.envio ?? 0;
  const subir = furia && p === "final" ? 1 : 0; // en furia, medio tono más agudo
  const m = mel[i % mel.length];
  if (m) nota(c, hz(m.n + subir), t, m.pasos * corchea * (tb.legato ?? 0.92), tb.lider, tb.vol ?? 0.07, { vibrato: tb.vibrato, envio });
  const compas = Math.floor(i / 8) % raices.length;
  const b = part.bajo[i % 8];
  if (b >= 0) nota(c, hz(raices[compas] + b + subir), t, corchea * 0.85, tb.bajo, 0.16, { envio: envio * 0.5 });
  const a = part.arpegio?.[i % 8] ?? -1;
  if (a >= 0) nota(c, hz(raices[compas] + 24 + a + subir), t, corchea * 0.7, "triangle", 0.035, { envio });
  switch (golpeDe(part.bateria, i, enNivel)) {
    case "k":
      nota(c, 140, t, 0.12, "sine", 0.22, { f1: 45 });
      break;
    case "s":
      golpe(c, t, 0.1, 0.07, "bandpass", 1800, envio);
      break;
    case "h":
      golpe(c, t, 0.03, 0.03, "highpass", 7000, envio);
      break;
  }
}

/** Secuenciador con anticipación: cada 50 ms programa las corcheas de los próximos 200 ms. */
function vuelta() {
  const c = ctx;
  if (!c || !maestro || !tema) return;
  if (!activa || !sonidoActivo() || vol <= 0 || oculta()) {
    siguiente = 0; // en silencio no avanza; al volver retoma donde iba
    return;
  }
  if (c.state === "suspended") void c.resume().catch(() => {});
  const ritmo = (furia && tema === "final" ? 1.2 : 1) * (enNivel ? ACELERA_NIVEL : 1);
  const corchea = 60 / (PISTAS[tema].bpm * ritmo) / 2;
  if (siguiente < c.currentTime) siguiente = c.currentTime + 0.05;
  try {
    while (siguiente < c.currentTime + 0.2) {
      programarPaso(c, tema, paso, siguiente, corchea);
      paso = (paso + 1) % COMPILADAS[tema].mel.length;
      siguiente += corchea;
    }
  } catch {
    /* el audio nunca rompe el juego */
  }
}

function arrancar() {
  if (!tema || !gesto || reloj) return;
  if (!contexto()) return;
  siguiente = 0;
  reloj = setInterval(vuelta, 50);
  vuelta();
}
function parar() {
  if (reloj) clearInterval(reloj);
  reloj = null;
}

/** Recalcula qué suena; si cambia la partitura (o el modo), empieza desde el principio. */
function actualizar() {
  const r = pista ? resolverPista(pista) : null;
  const nuevo = r?.tema ?? null;
  const nivel = r?.nivel ?? false;
  const cambio = nuevo !== tema || nivel !== enNivel;
  if (cambio) {
    tema = nuevo;
    enNivel = nivel;
    paso = 0;
    siguiente = 0;
    ajustarEco();
  }
  return cambio;
}

// ------------------------------------------------------------------ API pública
export const musica = {
  /**
   * Pide una pista (idempotente): "mapa"/"nivel" siguen al bioma fijado con `setBioma`, "final" es la
   * del jefe y un id de bioma suena tal cual. Si aún no hubo gesto, suena en cuanto lo haya.
   */
  reproducir(p: Pista): void {
    const antes = pista;
    pista = p;
    const cambio = actualizar();
    if (cambio || antes !== p) avisar();
    arrancar();
  },
  /** Fija el bioma del mapa (def.) o del nivel; si esa pista está sonando, cambia de música. */
  setBioma(b: Bioma, modo: ModoPista = "mapa"): void {
    if (!esTema(b)) return;
    if (modo === "nivel") biomaNivel = b;
    else biomaMapa = b;
    if (pista && actualizar()) avisar();
  },
  /** Bioma fijado para el mapa o el nivel. */
  bioma: (modo: ModoPista = "mapa"): Bioma => (modo === "nivel" ? biomaNivel : biomaMapa),
  /** Atajo: fija el bioma del modo y reproduce ese modo. */
  reproducirBioma(b: Bioma, modo: ModoPista = "mapa"): void {
    musica.setBioma(b, modo);
    musica.reproducir(modo);
  },
  detener(): void {
    pista = null;
    actualizar();
    parar();
    avisar();
  },
  activa: (): boolean => activa,
  setActiva(b: boolean): void {
    activa = b;
    escribir(CLAVE, b ? "on" : "off");
    avisar();
    if (b) {
      gesto = true; // se llama desde un clic (Ajustes o botón de Inicio)
      arrancar();
    }
  },
  volumen: (): number => vol,
  setVolumen(v: number): void {
    vol = recortar(v);
    escribir(CLAVE_VOL, String(vol));
    if (maestro && ctx) maestro.gain.setValueAtTime(vol * 0.5, ctx.currentTime);
    avisar();
  },
  /** Pista pedida ahora mismo (null si está detenida). */
  pista: (): Pista | null => pista,
  /** Partitura que suena de verdad (bioma o "final"; null si está detenida). */
  tema: (): Tema | null => tema,
  /** Nivel final: el jefe enfurecido acelera la música y la sube medio tono. */
  setFuria(b: boolean): void {
    furia = b;
  },
};

function suscribir(f: () => void) {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}

/** Estado de la música para Ajustes y el botón de Inicio. */
export function useMusica() {
  const f = useSyncExternalStore(suscribir, () => foto, () => foto);
  return { activa: f.activa, volumen: f.volumen, pista: f.pista, tema: f.tema, setActiva: musica.setActiva, setVolumen: musica.setVolumen };
}

// Primer gesto (autoplay) y pestaña oculta.
if (typeof window !== "undefined") {
  const eventos = ["pointerdown", "keydown", "touchstart"] as const;
  const despertar = () => {
    eventos.forEach((e) => window.removeEventListener(e, despertar, true));
    gesto = true;
    arrancar();
  };
  eventos.forEach((e) => window.addEventListener(e, despertar, { capture: true, passive: true }));
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    try {
      if (oculta()) void ctx.suspend().catch(() => {});
      else if (reloj) void ctx.resume().catch(() => {});
    } catch {
      /* nada */
    }
  });
}
