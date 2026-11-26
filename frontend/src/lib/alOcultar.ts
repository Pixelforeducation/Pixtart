import { useEffect, useRef } from "react";

/**
 * Avisa cuando la página deja de verse (cambio de pestaña/app, móvil suspendido, cerrar o recargar:
 * `visibilitychange` → hidden y `pagehide`) y cuando vuelve a verse (`visibilitychange` → visible o
 * `pageshow` desde la caché de atrás/adelante). Puede llamar varias veces seguidas al mismo
 * callback: quien lo usa debe ser idempotente.
 */
export function useAlOcultar(alOcultar: () => void, alVolver: () => void): void {
  const ocultar = useRef(alOcultar);
  ocultar.current = alOcultar;
  const volver = useRef(alVolver);
  volver.current = alVolver;

  useEffect(() => {
    const vis = () => (document.visibilityState === "hidden" ? ocultar.current() : volver.current());
    const salir = () => ocultar.current();
    const regreso = (e: PageTransitionEvent) => { if (e.persisted) volver.current(); };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("pagehide", salir);
    window.addEventListener("pageshow", regreso);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("pagehide", salir);
      window.removeEventListener("pageshow", regreso);
    };
  }, []);
}
