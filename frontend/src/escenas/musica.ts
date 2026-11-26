/**
 * Música de fondo chiptune, original y sintetizada con Web Audio (sin archivos de audio ni derechos de
 * terceros). Tres pistas en bucle: "mapa" (alegre, Do mayor), "nivel" (enérgica, La menor) y "final"
 * (épica, Re menor); cada una con melodía (onda cuadrada), bajo (triangular) y percusión suave (ruido).
 *
 *   musica.reproducir("nivel")  · musica.detener()
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

export type Pista = "mapa" | "nivel" | "final";

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
}

export const PISTAS: Readonly<Record<Pista, Partitura>> = {
  mapa: {
    bpm: 112,
    melodia: `
      E5 - G5 C6 B5 - G5 -   A5 - G5 E5 F5 E5 D5 -
      E5 - G5 C6 D6 - C6 B5  A5 - - - G5 - . .
      F5 - A5 C6 B5 - G5 -   E5 - G5 E5 D5 C5 D5 -
      E5 G5 F5 D5 C5 - E5 D5 C5 - - - . . . .`,
    raices: "C3 A2 F2 G2 F2 C3 G2 C3",
    bajo: [0, -1, 12, -1, 0, -1, 7, -1],
    bateria: "k.h.s.h.",
  },
  nivel: {
    bpm: 138,
    melodia: `
      A4 C5 E5 A5 G5 E5 C5 E5  F5 - E5 D5 E5 - C5 -
      D5 F5 A5 D6 C6 A5 F5 A5  G5 - F5 E5 D5 - B4 -
      A4 C5 E5 A5 B5 - A5 G5   F5 - A5 - G5 F5 E5 -
      D5 E5 F5 G5 A5 G5 F5 E5  E5 - - - G#5 - - -`,
    raices: "A2 F2 D2 G2 A2 F2 D2 E2",
    bajo: [0, 12, 0, 12, 0, 12, 7, 12],
    bateria: "khskkhsh",
  },
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
  },
};

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
  (Object.keys(PISTAS) as Pista[]).map((p) => [p, { mel: compilarMelodia(PISTAS[p].melodia), raices: PISTAS[p].raices.split(/\s+/).map((r) => midi(r) ?? 36) }]),
) as Record<Pista, { mel: (Nota | null)[]; raices: number[] }>;

// ------------------------------------------------------------------ estado
let activa = leer(CLAVE) !== "off";
let vol = (() => {
  const crudo = leer(CLAVE_VOL);
  return crudo === null ? VOLUMEN_MUSICA_DEF : recortar(Number(crudo));
})();
let pista: Pista | null = null;
let furia = false;
let foto: { activa: boolean; volumen: number; pista: Pista | null } = { activa, volumen: vol, pista };
const oyentes = new Set<() => void>();
function avisar() {
  foto = { activa, volumen: vol, pista };
  oyentes.forEach((f) => f());
}

let ctx: AudioContext | null = null;
let maestro: GainNode | null = null;
let ruidoBuf: AudioBuffer | null = null;
let reloj: ReturnType<typeof setInterval> | null = null;
let paso = 0;
let siguiente = 0;
let gesto = false; // ya hubo un gesto del usuario (política de autoplay)

function oculta(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
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

function nota(c: AudioContext, f: number, t: number, dur: number, tipo: OscillatorType, v: number, f1?: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = tipo;
  o.frequency.setValueAtTime(f, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.008);
  g.gain.setValueAtTime(v, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(maestro!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function golpe(c: AudioContext, t: number, dur: number, v: number, tipo: BiquadFilterType, frec: number) {
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
  s.start(t);
  s.stop(t + dur + 0.02);
}

function programarPaso(c: AudioContext, p: Pista, i: number, t: number, corchea: number) {
  const part = PISTAS[p];
  const { mel, raices } = COMPILADAS[p];
  const subir = furia && p === "final" ? 1 : 0; // en furia, medio tono más agudo
  const m = mel[i % mel.length];
  if (m) nota(c, hz(m.n + subir), t, m.pasos * corchea * 0.92, "square", 0.07);
  const compas = Math.floor(i / 8) % raices.length;
  const b = part.bajo[i % 8];
  if (b >= 0) nota(c, hz(raices[compas] + b + subir), t, corchea * 0.85, "triangle", 0.16);
  switch (part.bateria[i % 8]) {
    case "k":
      nota(c, 140, t, 0.12, "sine", 0.22, 45);
      break;
    case "s":
      golpe(c, t, 0.1, 0.07, "bandpass", 1800);
      break;
    case "h":
      golpe(c, t, 0.03, 0.03, "highpass", 7000);
      break;
  }
}

/** Secuenciador con anticipación: cada 50 ms programa las corcheas de los próximos 200 ms. */
function vuelta() {
  const c = ctx;
  if (!c || !maestro || !pista) return;
  if (!activa || !sonidoActivo() || vol <= 0 || oculta()) {
    siguiente = 0; // en silencio no avanza; al volver retoma donde iba
    return;
  }
  if (c.state === "suspended") void c.resume().catch(() => {});
  const corchea = 60 / (PISTAS[pista].bpm * (furia ? 1.2 : 1)) / 2;
  if (siguiente < c.currentTime) siguiente = c.currentTime + 0.05;
  try {
    while (siguiente < c.currentTime + 0.2) {
      programarPaso(c, pista, paso, siguiente, corchea);
      paso = (paso + 1) % COMPILADAS[pista].mel.length;
      siguiente += corchea;
    }
  } catch {
    /* el audio nunca rompe el juego */
  }
}

function arrancar() {
  if (!pista || !gesto || reloj) return;
  if (!contexto()) return;
  siguiente = 0;
  reloj = setInterval(vuelta, 50);
  vuelta();
}
function parar() {
  if (reloj) clearInterval(reloj);
  reloj = null;
}

// ------------------------------------------------------------------ API pública
export const musica = {
  /** Pide una pista (idempotente). Si aún no hubo gesto, suena en cuanto lo haya. */
  reproducir(p: Pista): void {
    if (pista === p && reloj) return;
    if (pista !== p) {
      pista = p;
      paso = 0;
      siguiente = 0;
      avisar();
    }
    arrancar();
  },
  detener(): void {
    pista = null;
    parar();
    avisar();
  },
  activa: (): boolean => activa,
  setActiva(b: boolean): void {
    activa = b;
    escribir(CLAVE, b ? "on" : "off");
    avisar();
    if (b) {
      gesto = true; // se llama desde un clic en Ajustes
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

/** Estado de la música para Ajustes. */
export function useMusica() {
  const f = useSyncExternalStore(suscribir, () => foto, () => foto);
  return { activa: f.activa, volumen: f.volumen, pista: f.pista, setActiva: musica.setActiva, setVolumen: musica.setVolumen };
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
