/**
 * CONTRATO DE ARTE (dueño: agente `arte`). Los demás agentes solo IMPORTAN de aquí.
 * Implementación mínima: el agente `arte` la reemplaza manteniendo estas firmas.
 *
 * Nombres de sprite: "<grupo>/<id>" → /sprites/<grupo>/<id>.svg (o frames <id>-<anim>-fN.svg).
 * Grupos: heroe, mascota, anfitrion, enemigo, item, icono, cofre, efecto.
 */
import type { CSSProperties } from "react";

export type Anim = "idle" | "feliz" | "triste" | "herido" | "ataque" | "caminar" | "hablar";

export interface SpriteProps {
  nombre: string;
  anim?: Anim;
  escala?: number; // múltiplo entero de 32 px lógicos
  alt: string; // "" si es decorativo
  className?: string;
  style?: CSSProperties;
}

export function spriteUrl(nombre: string, _anim: Anim = "idle"): string {
  return `/sprites/${nombre}.svg`;
}

export function Sprite({ nombre, anim = "idle", escala = 3, alt, className, style }: SpriteProps) {
  const lado = 32 * escala;
  return (
    <img
      className={`sprite ${className ?? ""}`}
      src={spriteUrl(nombre, anim)}
      alt={alt}
      width={lado}
      height={lado}
      draggable={false}
      style={{ imageRendering: "pixelated", ...style }}
    />
  );
}

/** Ficha de personaje para diálogos, catálogos y tooltips. */
export interface FichaPersonaje {
  id: string; // p. ej. "mascota/zorro-brasas"
  nombre: string;
  rol: "heroe" | "mascota" | "anfitrion" | "enemigo";
  rareza?: "comun" | "rara" | "legendaria";
}

/** Sprite de mascota a partir de la `especie` que manda la API (EstadoMascota.especie). */
export const spriteMascota = (especie: string) => `mascota/${especie}`;
/** Sprite del héroe del jugador según el tier (1..6). */
export const spriteHeroe = (tier: number) => `heroe/tier${Math.max(1, Math.min(6, tier))}`;
/** Sprite de un ítem del inventario o la tienda por su `item_id`. */
export const spriteItem = (itemId: string) =>
  itemId.startsWith("mascota_") ? `mascota/${itemId.slice(8)}` : `item/${itemId}`;
/** Ícono de la navegación y la UI. */
export const spriteIcono = (id: string) => `icono/${id}`;

export const ANFITRIONES: FichaPersonaje[] = [];
export const ENEMIGOS: FichaPersonaje[] = [];
