/**
 * Lógica pura de enganche (sin I/O): combo, hitos de racha, estrellas del nivel y "¡casi!".
 * Es solo celebración visual: la XP real la decide el servidor (PLAN: +10 por acierto,
 * +5×min(racha,10) de bonus, +20 por nivel, +30 por perfecto; los errores no restan).
 */
import type { RespuestaPregunta, TipoPregunta } from "../api";

/** Nivel visual del combo (1..4) según aciertos seguidos: 3 → ×2, 5 → ×3, 8 → ×4. */
export function nivelCombo(racha: number): 1 | 2 | 3 | 4 {
  return racha >= 8 ? 4 : racha >= 5 ? 3 : racha >= 3 ? 2 : 1;
}

/** Racha tras responder: sube con el acierto y vuelve a 0 con el error. */
export function siguienteRacha(racha: number, correcta: boolean): number {
  return correcta ? racha + 1 : 0;
}

/** ¿Esta racha merece fiesta extra? (cuando sube el multiplicador y luego cada 10). */
export function esHitoRacha(racha: number): boolean {
  return racha === 3 || racha === 5 || racha === 8 || (racha > 0 && racha % 10 === 0);
}

/** Bonus de XP por racha según el PLAN (para mostrarlo; el servidor lo suma al terminar). */
export function bonusRacha(racha: number): number {
  return 5 * Math.min(Math.max(0, racha), 10);
}

/** Estrellas del nivel (1..3): 3 = perfecto, 2 = ≥ 60 % de aciertos, 1 = terminarlo. Nunca 0: terminar ya es logro. */
export function estrellasNivel(aciertos: number, total: number, perfecto: boolean): 1 | 2 | 3 {
  if (perfecto || (total > 0 && aciertos >= total)) return 3;
  return total > 0 && aciertos / total >= 0.6 ? 2 : 1;
}

function distancia(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/**
 * ¿La respuesta equivocada estuvo cerca? (efecto "casi": anima a intentar de nuevo).
 * Numérica: a ≤ 10 % (o ≤ 3× la tolerancia, o ±1 si el número es pequeño). Texto: a 1–2 letras. Ordenar: solo un par cambiado.
 */
export function esCasi(tipo: TipoPregunta, dada: RespuestaPregunta | null, correcta: RespuestaPregunta, tolerancia?: number | null): boolean {
  if (dada === null || dada === undefined) return false;
  if (tipo === "numeric") {
    const d = Number(dada), c = Number(correcta);
    if (!Number.isFinite(d) || !Number.isFinite(c) || d === c) return false;
    // 10 % del valor, 3× la tolerancia, o ±1 en números pequeños (el típico "me pasé por uno").
    const margen = Math.max(Math.abs(c) * 0.1, (tolerancia ?? 0) * 3, Math.abs(c) <= 20 ? 1 : 0);
    return Math.abs(d - c) <= margen;
  }
  if (tipo === "fill_text" || tipo === "fill_code") {
    const opciones = Array.isArray(correcta) ? correcta.map(String) : [String(correcta)];
    const x = norm(String(dada));
    return opciones.some((o) => {
      const k = distancia(x, norm(o));
      return k > 0 && k <= (o.length > 6 ? 2 : 1);
    });
  }
  if (tipo === "ordering" && Array.isArray(dada) && Array.isArray(correcta) && dada.length === correcta.length) {
    const mal = dada.filter((v, i) => v !== correcta[i]).length;
    return mal === 2;
  }
  return false;
}
