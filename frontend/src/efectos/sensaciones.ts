/**
 * Sensaciones físicas ligeras: vibración (haptics), sacudida de pantalla y textos flotantes ("+10 XP").
 * Todo es opcional y se apaga solo con prefers-reduced-motion (o si el navegador no lo soporta).
 */
import { menosMovimiento } from "./movimiento";
import type { Punto } from "./particulas";

// ---- Vibración ----
const CLAVE_VIB = "pixtart:vibracion";
let vibracion = (() => {
  try {
    return localStorage.getItem(CLAVE_VIB) !== "off";
  } catch {
    return true;
  }
})();

export function vibracionActiva(): boolean {
  return vibracion;
}
export function ponerVibracion(activa: boolean) {
  vibracion = activa;
  try {
    localStorage.setItem(CLAVE_VIB, activa ? "on" : "off");
  } catch {
    /* solo esta sesión */
  }
}

export type Vibracion = "toque" | "acierto" | "error" | "racha" | "cofre" | "logro";
/** Patrones cortos (ms). El error es un solo pulso suave: informa, no regaña. */
export const PATRONES: Record<Vibracion, number | number[]> = {
  toque: 8,
  acierto: 18,
  error: 40,
  racha: [20, 40, 20, 40, 40],
  cofre: [30, 60, 30, 60, 90],
  logro: [40, 60, 40, 60, 120],
};

export function vibrar(p: Vibracion) {
  if (!vibracion || menosMovimiento()) return;
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(PATRONES[p]);
  } catch {
    /* sin vibración */
  }
}

// ---- Sacudida de pantalla ----
/**
 * Sacude un elemento (por defecto el contenido principal). `fuerza` 0..3: 1 = error suave,
 * 2 = cofre, 3 = legendario. Usa Web Animations; sin soporte o con reduced-motion no hace nada.
 */
export function sacudir(el?: Element | null, fuerza = 1) {
  if (menosMovimiento() || fuerza <= 0) return;
  const blanco = (el ?? (typeof document !== "undefined" ? document.getElementById("contenido") ?? document.body : null)) as HTMLElement | null;
  if (!blanco || typeof blanco.animate !== "function") return;
  const a = 2 + fuerza * 2;
  const pasos = [0, -a, a, -a * 0.7, a * 0.6, -a * 0.3, 0];
  try {
    blanco.animate(
      pasos.map((x, i) => ({ transform: `translate(${x}px, ${i % 2 ? -x / 3 : x / 4}px)` })),
      { duration: 220 + fuerza * 90, easing: "steps(6)" },
    );
  } catch {
    /* nada */
  }
}

// ---- Texto flotante ----
export interface Flotante {
  texto: string;
  desde: Punto;
  /** Si se da, el texto vuela hasta ahí (p. ej. el contador de XP); si no, sube y se desvanece. */
  hacia?: Punto | null;
  /** Color del texto (por defecto oro de moneda). */
  color?: string;
  /** Tamaño de fuente en px (pixel font). */
  tam?: number;
  duracion?: number;
}

/** Hace aparecer un texto pixel que flota (y opcionalmente vuela a un contador). No necesita CSS. */
export function flotarTexto({ texto, desde, hacia, color = "#FFE27A", tam = 14, duracion = 900 }: Flotante) {
  if (menosMovimiento() || typeof document === "undefined") return;
  const el = document.createElement("span");
  el.textContent = texto;
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, {
    position: "fixed", left: `${desde.x}px`, top: `${desde.y}px`, zIndex: "65", pointerEvents: "none",
    fontFamily: "var(--fuente-pixel, monospace)", fontSize: `${tam}px`, color, whiteSpace: "nowrap",
    textShadow: "2px 2px 0 #2A1A0E, -2px 0 0 #2A1A0E, 0 -2px 0 #2A1A0E, 2px 0 0 #2A1A0E",
    transform: "translate(-50%, -50%)",
  } satisfies Partial<CSSStyleDeclaration>);
  if (typeof el.animate !== "function") return;
  document.body.appendChild(el);
  const dx = hacia ? hacia.x - desde.x : 0;
  const dy = hacia ? hacia.y - desde.y : -60;
  const anim = el.animate(
    [
      { transform: "translate(-50%, -50%) scale(0.4)", opacity: 0 },
      { transform: "translate(-50%, -80%) scale(1.25)", opacity: 1, offset: 0.18 },
      { transform: "translate(-50%, -90%) scale(1)", opacity: 1, offset: 0.45 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${hacia ? 0.6 : 1})`, opacity: hacia ? 0.9 : 0 },
    ],
    { duration: duracion, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" },
  );
  const quitar = () => el.remove();
  anim.onfinish = quitar;
  anim.oncancel = quitar;
  setTimeout(quitar, duracion + 200);
}
