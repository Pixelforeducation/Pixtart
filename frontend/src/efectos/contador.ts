import { useEffect, useRef, useState } from "react";
import { menosMovimiento } from "./movimiento";

/**
 * Número que sube animado hasta `objetivo` (ease-out) tras `retraso` ms.
 * Empieza en `inicial` (0 por defecto). Con reduced-motion (o sin requestAnimationFrame) salta directo al valor final.
 */
export function useContador(objetivo: number, { duracion = 900, retraso = 0, alPaso, inicial = 0 }: { duracion?: number; retraso?: number; alPaso?: (v: number) => void; inicial?: number } = {}) {
  const [valor, setValor] = useState(() => (menosMovimiento() ? objetivo : inicial));
  const actual = useRef(valor);
  const cb = useRef(alPaso);
  cb.current = alPaso;

  useEffect(() => {
    const desde = actual.current;
    if (menosMovimiento() || typeof requestAnimationFrame === "undefined" || desde === objetivo) {
      actual.current = objetivo;
      setValor(objetivo);
      return;
    }
    let raf = 0;
    let t0 = 0;
    const id = setTimeout(() => {
      const paso = (t: number) => {
        if (!t0) t0 = t;
        const k = Math.min(1, (t - t0) / duracion);
        const e = 1 - Math.pow(1 - k, 3);
        const v = Math.round(desde + (objetivo - desde) * e);
        if (v !== actual.current) { actual.current = v; setValor(v); cb.current?.(v); }
        if (k < 1) raf = requestAnimationFrame(paso);
      };
      raf = requestAnimationFrame(paso);
    }, retraso);
    return () => { clearTimeout(id); cancelAnimationFrame(raf); actual.current = objetivo; };
  }, [objetivo, duracion, retraso]);

  return valor;
}
