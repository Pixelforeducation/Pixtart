/** ¿El sistema pide menos movimiento? Sin matchMedia (tests, SSR) responde false. */
export function menosMovimiento(): boolean {
  try {
    return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Espera `ms`, o nada si se pide menos movimiento (las pausas dramáticas no son necesarias). */
export function pausa(ms: number): Promise<void> {
  if (menosMovimiento() || ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

/** Elige un elemento al azar (refuerzo variable en frases y destellos). */
export function alAzar<T>(xs: readonly T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}
