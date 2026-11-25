/**
 * Punto de enganche de sonido para el marco (Inicio, HUD, Tienda, Perfil).
 * Este módulo NO reproduce audio: emite `pixtart:sonido` con el nombre del efecto y el
 * módulo `src/efectos` (agente `juego-ui`) lo escucha y decide qué sonar, a qué volumen y
 * si el jugador lo silenció. Así no hay dos motores de audio y las pantallas no dependen de él.
 *
 *   window.addEventListener("pixtart:sonido", (e) => tocar((e as CustomEvent<SonidoMarco>).detail));
 */
import { useCallback } from "react";

export type SonidoMarco =
  | "toque" // cualquier botón o nodo
  | "nodo" // abrir un nivel desde el camino
  | "bloqueado" // tocar algo con candado
  | "cofre" // abrir cofre
  | "moneda" // contador de monedas subiendo
  | "compra" // comprar en la tienda
  | "sin-dinero" // no alcanza
  | "meta"; // meta diaria cumplida

export const EVENTO_SONIDO = "pixtart:sonido";

export function sonar(nombre: SonidoMarco): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent<SonidoMarco>(EVENTO_SONIDO, { detail: nombre }));
  } catch {
    /* entornos sin CustomEvent */
  }
}

/** Hook de conveniencia: `const tocar = useSonido(); onClick={() => tocar("toque")}`. */
export function useSonido(): (nombre: SonidoMarco) => void {
  return useCallback((nombre: SonidoMarco) => sonar(nombre), []);
}
