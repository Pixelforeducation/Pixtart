/**
 * `useEfectos()`: fachada única para que cualquier pantalla dé "jugo" sin pensar en los detalles.
 * Combina sonido + partículas + sacudida + vibración + texto flotante en momentos con nombre.
 */
import { useEffect, useMemo } from "react";
import { esHitoRacha, nivelCombo } from "./combo";
import { menosMovimiento } from "./movimiento";
import { centro, lanzar, type Punto } from "./particulas";
import { flotarTexto, sacudir, vibrar } from "./sensaciones";
import { desbloquearAudio, tocar, useSonido } from "./sonido";

type Origen = Element | Punto | null | undefined;

function punto(o: Origen): Punto {
  if (o && "x" in o && "y" in o) return o as Punto;
  const c = centro(o as Element | null | undefined);
  if (c) return c;
  return { x: typeof window !== "undefined" ? window.innerWidth / 2 : 200, y: typeof window !== "undefined" ? window.innerHeight / 2 : 400 };
}

export interface Momentos {
  /** Acierto: chispas + "¡ding!" que sube con la racha + "+XP" volando + vibración corta. Hitos de racha → power-up. */
  acierto(o: { desde?: Origen; hacia?: Origen; racha: number; xp?: number; alLlegar?: () => void }): void;
  /** Error: sonido suave + sacudida leve (+ crujido de corazón si costó una vida). Sin castigo visual fuerte. */
  error(o?: { el?: Element | null; vidaPerdida?: boolean }): void;
  /** Monedas que vuelan a un contador; `alLlegar(i, total)` por cada una. */
  monedas(o: { desde?: Origen; hacia?: Origen; cantidad?: number; alLlegar?: (i: number, total: number) => void }): void;
  /** Celebración grande (fin de nivel, meta diaria, nivel perfecto). */
  celebrar(o?: { perfecto?: boolean }): void;
  /** Subir de tier / evolución. */
  subirNivel(): void;
  /** Abrir cofre (legendario = fanfarria, más sacudida y estrellas). */
  cofre(o: { desde?: Origen; legendario?: boolean }): void;
  /** Toque de botón: clic + micro-vibración. */
  toque(): void;
}

export const momentos: Momentos = {
  acierto({ desde, hacia, racha, xp = 0, alLlegar }) {
    const d = punto(desde);
    tocar("acierto", racha);
    vibrar("acierto");
    lanzar({ tipo: "chispa", desde: d, cantidad: 10 + 4 * nivelCombo(racha) });
    if (xp > 0) {
      const h = hacia ? punto(hacia) : null;
      flotarTexto({ texto: `+${xp} XP`, desde: { x: d.x, y: d.y - 20 }, hacia: h, tam: 18, duracion: 1000 });
      lanzar({
        tipo: "xp", desde: d, hacia: h, cantidad: Math.max(4, Math.min(10, Math.round(xp / 2))),
        alLlegar: (i) => { if (i % 2 === 0) tocar("xp", i); alLlegar?.(); },
      });
    }
    if (esHitoRacha(racha)) {
      setTimeout(() => { tocar("racha"); vibrar("racha"); }, 180);
      flotarTexto({ texto: `COMBO ×${nivelCombo(racha)}!`, desde: { x: d.x, y: d.y - 60 }, color: "#FF9A3C", tam: 18, duracion: 1200 });
    } else if (racha >= 3) setTimeout(() => tocar("combo", racha), 170);
  },
  error({ el, vidaPerdida } = {}) {
    tocar("error");
    vibrar("error");
    sacudir(el, 1);
    if (vidaPerdida) setTimeout(() => tocar("corazon"), 160);
  },
  monedas({ desde, hacia, cantidad = 8, alLlegar }) {
    lanzar({ tipo: "moneda", desde: punto(desde), hacia: hacia ? punto(hacia) : null, cantidad, alLlegar: (i, t) => { tocar("moneda"); alLlegar?.(i, t); } });
  },
  celebrar({ perfecto } = {}) {
    const w = typeof window !== "undefined" ? window.innerWidth : 400;
    tocar(perfecto ? "perfecto" : "fanfarria");
    vibrar("logro");
    lanzar({ tipo: "confeti", desde: { x: w * 0.25, y: 120 }, cantidad: 40 });
    lanzar({ tipo: "confeti", desde: { x: w * 0.75, y: 120 }, cantidad: 40 });
    if (perfecto) lanzar({ tipo: "estrella", desde: { x: w / 2, y: 160 }, cantidad: 14 });
  },
  subirNivel() {
    const w = typeof window !== "undefined" ? window.innerWidth : 400;
    tocar("subirNivel");
    vibrar("logro");
    lanzar({ tipo: "estrella", desde: { x: w / 2, y: 220 }, cantidad: 18 });
    lanzar({ tipo: "confeti", desde: { x: w / 2, y: 180 }, cantidad: 50 });
  },
  cofre({ desde, legendario }) {
    const d = punto(desde);
    tocar(legendario ? "cofreLegendario" : "cofre");
    vibrar("cofre");
    sacudir(null, legendario ? 3 : 2);
    lanzar({ tipo: "chispa", desde: d, cantidad: legendario ? 40 : 24 });
    lanzar({ tipo: "moneda", desde: d, cantidad: legendario ? 16 : 10 });
    if (legendario) {
      lanzar({ tipo: "estrella", desde: d, cantidad: 16 });
      lanzar({ tipo: "confeti", desde: d, cantidad: 60 });
    }
  },
  toque() {
    tocar("clic");
    vibrar("toque");
  },
};

/**
 * Hook para pantallas: devuelve los momentos de juego, el control de sonido y si hay reduced-motion.
 * También despierta el audio en el primer gesto (autoplay).
 */
export function useEfectos() {
  const sonido = useSonido();
  useEffect(() => desbloquearAudio(), []);
  return useMemo(() => ({ ...momentos, sonido, tocar, lanzar, sacudir, vibrar, flotarTexto, menosMovimiento: menosMovimiento() }), [sonido]);
}
