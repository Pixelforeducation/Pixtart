/**
 * Mapa central de sprites del nivel final. Usa el arte definitivo del contrato `src/arte`
 * (`heroe/tierN`, `enemigo/<id>`, `cofre/legendario`); los fondos y tiles siguen en `public/nivel-final/`.
 */
import type { TipoEncuentro } from "./logica";
import { animDisponible, framesDe, spriteUrl } from "../arte";

export interface FichaMonstruo {
  id: string;
  nombre: string;
  contrato: string; // nombre de sprite del contrato de arte
  idle: string;
  herido?: string; // si no hay, el motor tiñe el sprite de blanco
  escala: 1 | 2; // jefes a ×2 (64 px lógicos)
  mira: "izquierda" | "derecha" | "frente";
}

const HEROE_CONTRATO = "heroe/tier1";
export const HEROE = {
  contrato: HEROE_CONTRATO,
  idle: spriteUrl(HEROE_CONTRATO, "idle"),
  caminar: framesDe(HEROE_CONTRATO, "caminar").urls,
  ataque: spriteUrl(HEROE_CONTRATO, "ataque"),
};

const m = (id: string, nombre: string, extra: Partial<FichaMonstruo> = {}): FichaMonstruo => {
  const contrato = `enemigo/${id}`;
  return {
    id,
    nombre,
    contrato,
    idle: spriteUrl(contrato, "idle"),
    herido: animDisponible(contrato, "herido") === "herido" ? spriteUrl(contrato, "herido") : undefined,
    escala: 1,
    mira: "frente",
    ...extra,
  };
};

export const COMUNES: FichaMonstruo[] = [
  m("ogre-green", "Ogro verde"),
  m("imp-small", "Diablillo"),
  m("skeleton-small", "Esqueleto"),
  m("zombie", "Zombie", { mira: "derecha" }),
];

export const RAROS: FichaMonstruo[] = [
  m("ghost", "Fantasma"),
  m("ogre-explorador", "Ogro explorador"),
  m("ogre-erudito", "Ogro erudito"),
];

export const JEFES: FichaMonstruo[] = [
  m("skeleton-big", "Coloso esqueleto", { escala: 2 }),
  m("demon-big", "Demonio mayor", { escala: 2 }),
];

export const JEFE_LEGENDARIO: FichaMonstruo = m("black-knight", "Caballero negro", { escala: 2 });

export const COFRE_LEGENDARIO = spriteUrl("cofre/legendario", "idle");

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
