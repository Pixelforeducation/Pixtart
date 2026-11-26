/** Sonido chiptune sintetizado (WebAudio, sin archivos): efectos (silencio por defecto). La música es la global. */
import { musica as musicaGlobal } from "../escenas/musica";

const CLAVE = "pixtart.nivelFinal.sonido";

export type Efecto = "golpe" | "critico" | "herido" | "caida" | "jefe" | "furia" | "victoria" | "derrota" | "cofre";

type Nota = [frecuencia: number, duracion: number, onda: OscillatorType];

const NOTAS: Record<Efecto, Nota[]> = {
  golpe: [[660, 0.05, "square"], [880, 0.07, "square"]],
  critico: [[880, 0.04, "square"], [1320, 0.05, "square"], [1760, 0.12, "square"]],
  herido: [[220, 0.1, "sawtooth"], [150, 0.18, "sawtooth"]],
  caida: [[520, 0.06, "square"], [390, 0.06, "square"], [260, 0.06, "square"], [130, 0.2, "triangle"]],
  jefe: [[98, 0.22, "sawtooth"], [92, 0.22, "sawtooth"], [87, 0.4, "sawtooth"]],
  furia: [[110, 0.15, "sawtooth"], [220, 0.1, "square"], [98, 0.35, "sawtooth"]],
  victoria: [[523, 0.1, "square"], [659, 0.1, "square"], [784, 0.1, "square"], [1047, 0.12, "square"], [784, 0.08, "square"], [1047, 0.35, "square"]],
  derrota: [[392, 0.15, "triangle"], [330, 0.15, "triangle"], [262, 0.35, "triangle"]],
  cofre: [[784, 0.06, "square"], [988, 0.06, "square"], [1175, 0.06, "square"], [1568, 0.3, "triangle"]],
};

export function sonidoGuardado(): boolean {
  try {
    return localStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
}

export function guardarSonido(activo: boolean): void {
  try {
    localStorage.setItem(CLAVE, activo ? "1" : "0");
  } catch {
    /* sin almacenamiento: se queda en memoria */
  }
}

let ctx: AudioContext | null = null;

function contexto(): AudioContext | null {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function nota(c: AudioContext, f: number, t: number, d: number, tipo: OscillatorType, vol: number): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = tipo;
  o.frequency.value = f;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + d + 0.02);
}

export function tocar(efecto: Efecto, activo: boolean): void {
  if (!activo) return;
  try {
    const c = contexto();
    if (!c) return;
    let t = c.currentTime;
    for (const [f, d, tipo] of NOTAS[efecto]) {
      nota(c, f, t, d, tipo, 0.06);
      t += d * 0.9;
    }
  } catch {
    /* audio no disponible */
  }
}

// ---- Música: el nivel final ya no tiene bucle propio (antes sonaba encima de la música global).
// Usa la pista "final" de `escenas/musica.ts`, que sigue los ajustes globales de música y el silencio
// global. El interruptor local del nivel final (sonidoGuardado) solo controla estos efectos.
// La pista "final" la pide el marco (App.tsx) según la ruta /final/…; aquí solo se marca la furia.

/** Compatibilidad con `index.tsx`: marca la furia (acelera la pista "final"); `activa` ya no enciende otro bucle. */
export function musica(_activa: boolean, furia = false): void {
  musicaGlobal.setFuria(furia);
}
