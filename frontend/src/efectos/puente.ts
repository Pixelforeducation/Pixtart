/**
 * Puente entre el marco (`src/escenas/sonido.ts`, que solo emite `pixtart:sonido`) y el motor de
 * audio de `src/efectos`. Así Inicio, Tienda, Perfil y el HUD suenan con el mismo volumen y el
 * mismo silencio que la pantalla de juego. Se instala una vez en `main.tsx`.
 */
import { EVENTO_SONIDO, type SonidoMarco } from "../escenas/sonido";
import { tocar, type Sonido } from "./sonido";

const MAPA: Record<SonidoMarco, Sonido> = {
  toque: "clic",
  nodo: "whoosh",
  bloqueado: "error",
  cofre: "cofre",
  moneda: "moneda",
  compra: "moneda",
  "sin-dinero": "error",
  meta: "fanfarria",
};

let instalado = false;

export function instalarPuenteSonido(): () => void {
  if (instalado || typeof window === "undefined") return () => {};
  instalado = true;
  const oir = (e: Event) => {
    const s = MAPA[(e as CustomEvent<SonidoMarco>).detail];
    if (s) tocar(s);
  };
  window.addEventListener(EVENTO_SONIDO, oir);
  return () => {
    window.removeEventListener(EVENTO_SONIDO, oir);
    instalado = false;
  };
}
