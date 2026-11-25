/**
 * Mapa central de sprites del nivel final.
 *
 * PROVISIONAL: el agente `arte` está creando los sprites definitivos con los nombres del contrato
 * `src/arte` (`heroe/tierN`, `enemigo/<id>` → `/sprites/<grupo>/<id>.svg`). Mientras tanto se cargan
 * copias de `cristoredentor.github.io/assets/` en `public/nivel-final/provisional/`. Para cambiar al
 * arte definitivo basta con apuntar `RUTA` a `spriteUrl()` de `src/arte` (cada ficha ya lleva su
 * nombre de contrato en `contrato`).
 */
import type { TipoEncuentro } from "./logica";

const RUTA = "/nivel-final/provisional/";
const url = (archivo: string) => `${RUTA}${archivo}.svg`;

export interface FichaMonstruo {
  id: string;
  nombre: string;
  contrato: string; // nombre de sprite del contrato de arte
  idle: string;
  herido?: string; // si no hay, el motor tiñe el sprite de blanco
  escala: 1 | 2; // jefes a ×2 (64 px lógicos)
  mira: "izquierda" | "derecha" | "frente";
}

export const HEROE = {
  contrato: "heroe/tier1",
  idle: url("player-idle"),
  caminar: [url("player-walk-f1"), url("player-walk-f2")],
  ataque: url("player-attack"),
};

/** Monstruos con frames idle/hurt separados (los demás son un solo sprite). */
const CON_HERIDO = new Set(["ogre-green", "imp-small", "skeleton-small", "zombie"]);

const m = (id: string, nombre: string, extra: Partial<FichaMonstruo> = {}): FichaMonstruo => ({
  id,
  nombre,
  contrato: `enemigo/${id}`,
  idle: url(CON_HERIDO.has(id) ? `${id}-idle` : id),
  herido: CON_HERIDO.has(id) ? url(`${id}-hurt`) : undefined,
  escala: 1,
  mira: "frente",
  ...extra,
});

export const COMUNES: FichaMonstruo[] = [
  m("ogre-green", "Ogro verde"),
  m("imp-small", "Diablillo"),
  m("skeleton-small", "Esqueleto"),
  m("zombie", "Zombie", { mira: "derecha" }),
];

export const RAROS: FichaMonstruo[] = [
  m("ghost", "Fantasma"),
  m("ogre-green--skin-explorador", "Ogro explorador"),
  m("ogre-green--skin-erudito", "Ogro erudito"),
];

export const JEFES: FichaMonstruo[] = [
  m("skeleton-big", "Coloso esqueleto", { escala: 2 }),
  m("demon-big", "Demonio mayor", { escala: 2 }),
];

export const JEFE_LEGENDARIO: FichaMonstruo = m("black-knight", "Caballero negro", { escala: 2 });

export const COFRE_LEGENDARIO = url("chest-legendary");

/** Monstruo de cada encuentro. El jefe legendario va en la última sección del curso. */
export function monstruoPara(tipo: TipoEncuentro, indice: number, seccion: number, ultimaSeccion: boolean): FichaMonstruo {
  if (tipo === "jefe") return ultimaSeccion ? JEFE_LEGENDARIO : JEFES[seccion % JEFES.length];
  const lista = tipo === "raro" ? RAROS : COMUNES;
  return lista[(indice + seccion) % lista.length];
}

export type Suelo = "base" | "gris" | "aurora";

/** Tiles por tema (palette swap): regex → cueva gris; agentes/IA → aurora; resto → pradera. */
export function sueloPara(tema: string): Suelo {
  const t = tema.toLowerCase();
  if (/regex|expresion|patr/.test(t.normalize("NFD").replace(/[̀-ͯ]/g, ""))) return "gris";
  if (/agente|ia\b|llm|prompt/.test(t)) return "aurora";
  return "base";
}

export const FONDO = "/nivel-final/fondos/nivel-final-carrera.svg";
export const tile = (suelo: Suelo, nombre: "grass" | "dirt" | "stone" | "wood") => `/nivel-final/tiles/${suelo}/tile-${nombre}.svg`;
