/**
 * Sonidos chiptune sintetizados con Web Audio (sin archivos ni dependencias). Siempre opcionales:
 * silencio y volumen se recuerdan en localStorage (con try/catch) y nada del juego depende de oírlos.
 *
 * Autoplay: los navegadores no dejan sonar audio antes del primer gesto. `desbloquearAudio()` (se
 * llama solo al importar el módulo en el navegador) escucha el primer toque/tecla y despierta el
 * AudioContext; hasta entonces `tocar()` simplemente no suena.
 */
import { useSyncExternalStore } from "react";

export type Sonido =
  | "clic" // tocar un botón
  | "boton" // alias de clic
  | "acierto" // nivel = racha: el tono sube con el combo
  | "error" // suave, informa sin castigar
  | "combo" // arpegio de combo (nivel = racha)
  | "racha" // hito de racha (3, 5, 8…): power-up
  | "moneda"
  | "xp" // partícula de XP que llega a la barra
  | "subirNivel" // la barra de XP llena / sube de tier
  | "cofre" // abrir cofre normal
  | "cofreLegendario" // abrir cofre legendario: fanfarria larga
  | "fanfarria" // fin de nivel
  | "perfecto" // nivel sin errores
  | "estrella" // nivel = índice de la estrella (0..2), sube de tono
  | "tic" // nivel = segundos restantes: más agudo cuanto menos queda
  | "ayuda" // la mascota olfatea
  | "corazon" // se pierde una vida
  | "sacudida" // el cofre se mueve
  | "whoosh" // cortinilla / transición
  | "voz"; // blip del anfitrión al "hablar"

const CLAVE = "pixtart:sonido";
const CLAVE_VOL = "pixtart:volumen";

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
    /* almacenamiento bloqueado: solo vale para esta sesión */
  }
}

let silencio = leer(CLAVE) === "off";
let vol = (() => {
  const crudo = leer(CLAVE_VOL);
  const v = Number(crudo);
  return crudo !== null && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.7;
})();
const oyentes = new Set<() => void>();
let ctx: AudioContext | null = null;
let maestro: GainNode | null = null;
let foto = { activo: !silencio, volumen: vol };

function avisar() {
  foto = { activo: !silencio, volumen: vol };
  oyentes.forEach((f) => f());
}

export function sonidoActivo(): boolean {
  return !silencio;
}
export function volumen(): number {
  return vol;
}

export function ponerSonido(activo: boolean) {
  silencio = !activo;
  escribir(CLAVE, activo ? "on" : "off");
  avisar();
}

/** Volumen maestro 0..1 (se recorta al rango). */
export function ponerVolumen(v: number) {
  vol = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.7));
  escribir(CLAVE_VOL, String(vol));
  if (maestro && ctx) maestro.gain.setValueAtTime(vol, ctx.currentTime);
  avisar();
}

function suscribir(f: () => void) {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}

/** [activo, alternar] para un botón de silencio. */
export function useSonidoActivo(): [boolean, () => void] {
  const activo = useSyncExternalStore(suscribir, sonidoActivo, sonidoActivo);
  return [activo, () => ponerSonido(!activo)];
}

/** Estado completo del sonido para pantallas de ajustes. */
export function useSonido() {
  const f = useSyncExternalStore(suscribir, () => foto, () => foto);
  return { activo: f.activo, volumen: f.volumen, alternar: () => ponerSonido(!f.activo), ponerVolumen };
}

function contexto(): AudioContext | null {
  if (ctx) return ctx;
  const C: typeof AudioContext | undefined =
    typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (!C) return null;
  try {
    ctx = new C();
    maestro = ctx.createGain();
    maestro.gain.value = vol;
    maestro.connect(ctx.destination);
  } catch {
    ctx = null;
    maestro = null;
  }
  return ctx;
}

let desbloqueado = false;
/** Despierta el audio en el primer gesto del usuario (política de autoplay). Idempotente. */
export function desbloquearAudio() {
  if (desbloqueado || typeof window === "undefined") return;
  desbloqueado = true;
  const eventos = ["pointerdown", "keydown", "touchstart"] as const;
  const despertar = () => {
    eventos.forEach((e) => window.removeEventListener(e, despertar, true));
    const c = contexto();
    if (!c) return;
    try {
      if (c.state === "suspended") void c.resume();
      // Un buffer mudo "abre" el audio en iOS.
      const s = c.createBufferSource();
      s.buffer = c.createBuffer(1, 1, 22050);
      s.connect(c.destination);
      s.start(0);
    } catch {
      /* nada */
    }
  };
  eventos.forEach((e) => window.addEventListener(e, despertar, { capture: true, passive: true }));
}

function tono(c: AudioContext, salida: AudioNode, f0: number, t0: number, dur: number, tipo: OscillatorType = "square", v = 0.12, f1?: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = tipo;
  o.frequency.setValueAtTime(f0, t0);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(salida);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function ruido(c: AudioContext, salida: AudioNode, t0: number, dur: number, v = 0.1, filtro = 1200) {
  const n = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource();
  s.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = filtro;
  const g = c.createGain();
  g.gain.setValueAtTime(v, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(bp).connect(g).connect(salida);
  s.start(t0);
  s.stop(t0 + dur + 0.02);
}

/** Escala pentatónica mayor (Do): cualquier combinación suena bien, así el combo "sube" sin desafinar. */
export const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093, 2349.32];

/** Las dos notas del "¡ding!" de acierto: suben un grado de la pentatónica por cada acierto seguido (tope en 9). */
export function notasAcierto(racha: number): [number, number] {
  const i = Math.max(0, Math.min(8, Math.floor(racha) - 1));
  return [PENTA[i], PENTA[i + 2]];
}

/** Frecuencia del tic del reloj: más aguda cuanto menos tiempo queda (5 s → 1200 Hz, 1 s → 2000 Hz). */
export function frecuenciaTic(restante: number): number {
  const r = Math.max(1, Math.min(5, Math.ceil(restante)));
  return 1200 + (5 - r) * 200;
}

/** Toca un sonido. `nivel` modula algunos (racha, segundos, índice de estrella). Nunca lanza. */
export function tocar(s: Sonido, nivel = 0) {
  if (silencio || vol <= 0) return;
  const c = contexto();
  if (!c || !maestro) return;
  try {
    if (c.state === "suspended") void c.resume();
    const m = c.createGain();
    m.gain.value = 0.8;
    m.connect(maestro);
    const t = c.currentTime + 0.01;
    switch (s) {
      case "acierto": {
        const [a, b] = notasAcierto(Math.max(1, nivel));
        tono(c, m, a, t, 0.08);
        tono(c, m, b, t + 0.07, 0.18);
        if (nivel >= 5) tono(c, m, b * 2, t + 0.07, 0.18, "triangle", 0.05); // brillo extra en racha alta
        break;
      }
      case "error":
        // Suave y corto: informa, no castiga.
        tono(c, m, 220, t, 0.18, "triangle", 0.16, 165);
        tono(c, m, 196, t + 0.12, 0.2, "triangle", 0.12, 147);
        break;
      case "combo": {
        const base = Math.min(Math.max(0, nivel - 1), PENTA.length - 4);
        [0, 1, 2, 3].forEach((k) => tono(c, m, PENTA[base + k], t + k * 0.05, 0.08, "square", 0.08));
        break;
      }
      case "racha":
        // Power-up: barrido ascendente + acorde.
        tono(c, m, 392, t, 0.25, "square", 0.07, 1568);
        [783.99, 987.77, 1174.66].forEach((f) => tono(c, m, f, t + 0.22, 0.25, "square", 0.06));
        break;
      case "moneda":
        tono(c, m, 987.77, t, 0.06, "square", 0.07);
        tono(c, m, 1318.51, t + 0.05, 0.14, "square", 0.07);
        break;
      case "xp":
        tono(c, m, 1046.5 + Math.min(10, nivel) * 60, t, 0.05, "square", 0.05);
        break;
      case "estrella": {
        const i = Math.max(0, Math.min(2, nivel));
        const f = [783.99, 987.77, 1318.51][i];
        tono(c, m, f, t, 0.1, "square", 0.09);
        tono(c, m, f * 1.5, t + 0.08, 0.22, "square", 0.08);
        ruido(c, m, t, 0.08, 0.06, 5000);
        break;
      }
      case "subirNivel":
        [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.51].forEach((f, k) => tono(c, m, f, t + k * 0.08, 0.12, "square", 0.08));
        tono(c, m, 1567.98, t + 0.58, 0.6, "triangle", 0.12);
        break;
      case "tic":
        tono(c, m, frecuenciaTic(nivel || 5), t, 0.03, "square", 0.04);
        break;
      case "clic":
      case "boton":
        tono(c, m, 900, t, 0.025, "square", 0.04);
        break;
      case "voz":
        tono(c, m, 420 + Math.random() * 120, t, 0.03, "square", 0.025);
        break;
      case "whoosh":
        ruido(c, m, t, 0.28, 0.08, 900);
        tono(c, m, 300, t, 0.25, "sine", 0.03, 900);
        break;
      case "ayuda":
        [0, 0.12, 0.24].forEach((d) => ruido(c, m, t + d, 0.07, 0.12, 2400));
        tono(c, m, 784, t + 0.38, 0.1, "triangle", 0.12, 1046);
        break;
      case "corazon":
        tono(c, m, 440, t, 0.08, "square", 0.08, 330);
        ruido(c, m, t + 0.05, 0.12, 0.08, 800);
        break;
      case "sacudida":
        ruido(c, m, t, 0.18, 0.12, 300);
        break;
      case "cofre":
        ruido(c, m, t, 0.25, 0.14, 250);
        [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, k) => tono(c, m, f, t + 0.2 + k * 0.07, 0.18, "square", 0.08));
        break;
      case "cofreLegendario":
        ruido(c, m, t, 0.35, 0.16, 200);
        // Fanfarria en dos frases + acorde final sostenido.
        [[523.25, 0.3], [523.25, 0.42], [523.25, 0.54], [659.25, 0.66], [587.33, 0.9], [659.25, 1.02], [783.99, 1.14]].forEach(([f, d]) =>
          tono(c, m, f, t + d, 0.14, "square", 0.08));
        [1046.5, 1318.51, 1567.98].forEach((f) => tono(c, m, f, t + 1.32, 0.9, "triangle", 0.07));
        tono(c, m, 2093, t + 1.32, 0.9, "square", 0.03);
        break;
      case "fanfarria":
        [[523.25, 0], [659.25, 0.12], [783.99, 0.24], [1046.5, 0.36]].forEach(([f, d]) => tono(c, m, f, t + d, 0.16, "square", 0.08));
        tono(c, m, 1046.5, t + 0.5, 0.45, "triangle", 0.12);
        break;
      case "perfecto":
        [1046.5, 1318.51, 1567.98, 2093].forEach((f, k) => tono(c, m, f, t + k * 0.06, 0.12, "square", 0.06));
        [0, 0.1, 0.2].forEach((d) => ruido(c, m, t + 0.3 + d, 0.06, 0.05, 6000));
        break;
    }
  } catch {
    /* el audio nunca rompe el juego */
  }
}

desbloquearAudio();
