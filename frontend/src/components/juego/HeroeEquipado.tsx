/**
 * Héroe con su equipo (v0.3, mejoras 5 y 9).
 *
 * Se apilan capas SVG de 32×32 sobre el sprite del tier (todos los atuendos de
 * `herramientas/generar_sprites.py` comparten el mismo cuerpo: cabeza x11–20 y4–15, torso y16–23,
 * manos en (10–11, 22) y (20–21, 22), piernas y24–31), así que las capas encajan en cualquier tier:
 *
 *   capa (detrás) → sprite base → ropa → armadura → cosméticos de tier → arma (`.heroe-arma`)
 *
 * El arma va en su propio SVG más grande (viewBox -8 -12 48 48) para sobresalir de la silueta.
 *
 * Cosméticos de evolución (no salen en la tienda): tier 2 bandana + ropa de otro color; tier 3 pelo
 * cobrizo + hombreras; tier 4 casco; tier 5 capa y silueta más ancha; tier 6 además corona.
 * Si hay ropa equipada, la ropa manda en el color, pero los accesorios de tier siguen visibles.
 *
 * El sprite base se muestra en su primer frame (las capas no siguen el balanceo de los frames);
 * el movimiento lo dan las clases CSS (`heroe.css`) o el contenedor que lo anime.
 */
import { useEffect, useState, type CSSProperties } from "react";
import type { Equipo } from "../../api";
import { spriteHeroe, spriteUrl, type Anim } from "../../arte";
import "./heroe.css";

export type TipoAtaque = "punio" | "tajo" | "flecha" | "orbe" | "martillazo" | "triple";

const ATAQUES: Record<string, TipoAtaque> = {
  arma_espada: "tajo",
  arma_arco: "flecha",
  arma_baculo: "orbe",
  arma_martillo: "martillazo",
  arma_katana: "triple",
};

/** Animación de ataque que corresponde al arma equipada (sin arma: puñetazo). */
export function tipoAtaque(arma: string | null | undefined): TipoAtaque {
  return (arma && ATAQUES[arma]) || "punio";
}

// ---------------------------------------------------------------------------------------------
// Píxeles
// ---------------------------------------------------------------------------------------------

/** [x, y, ancho, alto, color] en la rejilla de 32×32. */
export type Px = readonly [number, number, number, number, string];

const O = "#1B1F3B"; // contorno
const PIEL = "#F0C08A";
const ORO = "#F2C230";
const ORO2 = "#C8941A";
const ORO3 = "#FFF1A0";
const ACERO = { a: "#A3A3AE", b: "#7A7A86", c: "#FFF6D8", d: "#4A4A55" };

interface Tela { a: string; b: string; c: string }

export function Pixeles({ px, viewBox = "0 0 32 32", className, ...resto }: { px: readonly Px[]; viewBox?: string; className?: string; [k: `data-${string}`]: string | undefined }) {
  return (
    <svg className={className} viewBox={viewBox} shapeRendering="crispEdges" aria-hidden="true" focusable="false" {...resto}>
      {px.map(([x, y, w, h, c], i) => <rect key={i} x={x} y={y} width={w} height={h} fill={c} />)}
    </svg>
  );
}

// ---- Ropa (torso, mangas y extras) ----

function torso(t: Tela): Px[] {
  return [
    [10, 17, 2, 4, t.a], [20, 17, 2, 4, t.a], [10, 21, 2, 1, t.b], [20, 21, 2, 1, t.b], // mangas
    [13, 16, 2, 1, t.c], [17, 16, 2, 1, t.c], [15, 16, 2, 1, PIEL], // cuello en V
    [13, 17, 6, 5, t.a], [18, 17, 1, 5, t.b], [14, 17, 1, 2, t.c], // pecho
    [13, 23, 6, 1, t.b], // faldón bajo el cinturón
  ];
}

/** Capa que cuelga detrás del cuerpo. */
function capaTrasera(t: { a: string; b: string }, ribete?: string): Px[] {
  const px: Px[] = [
    [9, 15, 14, 1, O], [8, 16, 1, 10, O], [23, 16, 1, 10, O], [7, 26, 1, 4, O], [24, 26, 1, 4, O], [7, 30, 18, 1, O],
    [9, 16, 14, 10, t.a], [8, 26, 16, 4, t.a],
    [9, 18, 1, 8, t.b], [22, 18, 1, 8, t.b], [8, 26, 1, 4, t.b], [23, 26, 1, 4, t.b],
  ];
  if (ribete) px.push([8, 29, 16, 1, ribete], [9, 29, 1, 1, O], [13, 29, 1, 1, O], [18, 29, 1, 1, O], [22, 29, 1, 1, O]);
  return px;
}

interface DefRopa { nombre: string; tela: Tela; capa?: { a: string; b: string; ribete?: string }; extra?: Px[] }

export const ROPAS: Record<string, DefRopa> = {
  ropa_tunica_verde: {
    nombre: "Túnica verde",
    tela: { a: "#3E8E41", b: "#2C5E2E", c: "#6BBF59" },
    extra: [[13, 22, 6, 1, "#5C3A1A"], [15, 22, 2, 1, ORO]],
  },
  ropa_capa_roja: {
    nombre: "Capa roja",
    tela: { a: "#2B2F55", b: O, c: "#4A4F85" },
    capa: { a: "#E04848", b: "#8E1F1F" },
    extra: [[12, 16, 1, 1, ORO], [19, 16, 1, 1, ORO]], // broches
  },
  ropa_traje_mago: {
    nombre: "Traje de mago",
    tela: { a: "#5B3FA8", b: "#3A2670", c: "#8A6FE0" },
    extra: [
      // túnica larga sobre las piernas
      [11, 24, 1, 5, O], [20, 24, 1, 5, O], [12, 24, 8, 4, "#5B3FA8"], [12, 28, 8, 1, "#3A2670"], [15, 24, 2, 4, "#3A2670"],
      [14, 19, 1, 1, ORO], [17, 26, 1, 1, ORO], [13, 25, 1, 1, ORO3], [13, 22, 6, 1, ORO2],
    ],
  },
  ropa_manto_real: {
    nombre: "Manto real",
    tela: { a: "#8E1F1F", b: "#5A1212", c: "#E04848" },
    capa: { a: "#5B3FA8", b: "#3A2670", ribete: "#FFFFFF" },
    extra: [[13, 22, 6, 1, ORO], [15, 22, 2, 1, "#3F7FE0"], [12, 16, 1, 1, ORO], [19, 16, 1, 1, ORO], [15, 18, 2, 1, ORO]],
  },
};

/** Color de ropa por tier cuando no hay ropa equipada (tier 1: el atuendo del sprite). */
const TELA_TIER: Record<number, Tela> = {
  2: { a: "#3F7FE0", b: "#2B5BB0", c: "#8FB8FF" },
  3: { a: "#B83A3A", b: "#8E1F1F", c: "#FF8A8A" },
  4: { a: "#2C7A6B", b: "#1F5A4E", c: "#58C9A8" },
  5: { a: "#5B3FA8", b: "#3A2670", c: "#8A6FE0" },
  6: { a: ORO, b: ORO2, c: ORO3 },
};

// ---- Armaduras ----

function malla(): Px[] {
  const px: Px[] = [];
  const zonas: [number, number, number, number][] = [[13, 17, 6, 5], [10, 17, 2, 4], [20, 17, 2, 4]];
  for (const [x0, y0, w, h] of zonas)
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px.push([x, y, 1, 1, (x + y) % 2 ? ACERO.a : ACERO.b]);
  px.push([13, 22, 6, 1, ACERO.d], [13, 23, 6, 1, ACERO.b]);
  return px;
}

interface DefArmadura { nombre: string; px: Px[] }

export const ARMADURAS: Record<string, DefArmadura> = {
  armadura_cuero: {
    nombre: "Armadura de cuero",
    px: [
      [13, 17, 6, 4, "#8B5A2B"], [13, 17, 6, 1, "#C08A4A"], [13, 21, 6, 1, "#5C3A1A"], [15, 18, 2, 3, "#5C3A1A"],
      [15, 18, 2, 1, "#C08A4A"], [15, 20, 2, 1, "#C08A4A"], [10, 17, 2, 1, "#8B5A2B"], [20, 17, 2, 1, "#8B5A2B"],
    ],
  },
  armadura_malla: { nombre: "Cota de malla", px: malla() },
  armadura_placas: {
    nombre: "Armadura de placas",
    px: [
      [13, 16, 6, 6, ACERO.a], [13, 16, 6, 1, ACERO.c], [18, 17, 1, 5, ACERO.b], [13, 21, 6, 1, ACERO.b],
      [15, 18, 2, 2, ORO], [15, 18, 1, 1, ORO3], [13, 22, 6, 1, ORO2],
      [9, 16, 3, 1, O], [9, 17, 3, 2, ACERO.a], [9, 17, 3, 1, ACERO.c], [20, 16, 3, 1, O], [20, 17, 3, 2, ACERO.a], [20, 17, 3, 1, ACERO.c],
      [10, 19, 2, 2, ACERO.b], [20, 19, 2, 2, ACERO.b], [10, 22, 2, 1, ACERO.a], [20, 22, 2, 1, ACERO.a], // brazales y guanteletes
      [13, 24, 2, 4, ACERO.a], [17, 24, 2, 4, ACERO.a], [13, 24, 2, 1, ACERO.c], [17, 24, 2, 1, ACERO.c], [14, 25, 1, 3, ACERO.b], [18, 25, 1, 3, ACERO.b],
    ],
  },
};

// ---- Armas ----
// Se dibujan en su propia capa, más grande que el cuerpo: viewBox "-8 -12 48 48" (1 unidad = 1 píxel del
// cuerpo), así el arma sobresale de la silueta sin cambiar la escala. La mano libre está en (20–21, 22);
// el arma se empuña ahí y lleva encima un puño (piel o guantelete) para que se lea "agarrada".
// Cada arma se describe por celdas y recibe un contorno oscuro automático de 1 px (8 vecinos), para que
// contraste con cualquier fondo. Algunas tienen sub-capas que la animación de ataque enciende o apaga
// (cuerda tensa del arco, brillo de la gema del báculo).

/** viewBox de la capa del arma, en coordenadas del cuerpo. */
export const VB_ARMA = { x: -8, y: -12, lado: 48 } as const;

type Celdas = Map<string, string>;
const clave = (x: number, y: number) => `${x},${y}`;

function lienzo() {
  const m: Celdas = new Map();
  const pon = (x: number, y: number, c: string) => { m.set(clave(Math.round(x), Math.round(y)), c); };
  const caja = (x: number, y: number, w: number, h: number, c: string) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) pon(i, j, c);
  };
  return { m, pon, caja };
}

/** Celdas → rects, fusionando tramos horizontales del mismo color. */
function aPx(m: Celdas): Px[] {
  const filas = new Map<number, [number, string][]>();
  for (const [k, c] of m) {
    const [x, y] = k.split(",").map(Number);
    (filas.get(y) ?? filas.set(y, []).get(y)!).push([x, c]);
  }
  const px: Px[] = [];
  for (const [y, fila] of [...filas].sort((a, b) => a[0] - b[0])) {
    fila.sort((a, b) => a[0] - b[0]);
    let [x0, c0] = fila[0];
    let w = 1;
    for (let i = 1; i <= fila.length; i++) {
      const sig = fila[i];
      if (sig && sig[0] === x0 + w && sig[1] === c0) { w++; continue; }
      px.push([x0, y, w, 1, c0]);
      if (sig) { [x0, c0] = sig; w = 1; }
    }
  }
  return px;
}

/** Contorno de 1 px alrededor de `m` (8 vecinos), sin pisar las celdas de `aparte`. */
function contorno(m: Celdas, aparte?: Celdas): Celdas {
  const o: Celdas = new Map();
  for (const k of m.keys()) {
    const [x, y] = k.split(",").map(Number);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const v = clave(x + dx, y + dy);
      if (!m.has(v) && !aparte?.has(v)) o.set(v, O);
    }
  }
  return o;
}

/** Puño que agarra el arma en la mano libre (piel, o guantelete si lleva armadura de placas). */
function punio(guante: boolean, x = 20): Celdas {
  const { m, caja } = lienzo();
  const [a, b] = guante ? [ACERO.a, ACERO.b] : [PIEL, "#C8905A"];
  caja(x, 21, 4, 3, a);
  caja(x, 23, 4, 1, b);
  caja(x, 21, 1, 3, b);
  return m;
}

/**
 * Dibujo pixel a partir de filas ASCII (un carácter por píxel, "." vacío) con contorno automático de 1 px.
 * Lo usan los efectos de ataque de la escena (flecha, orbe, tajos, polvo…).
 */
export function dibujoPx(filas: readonly string[], colores: Record<string, string>, borde: string | null = O): Px[] {
  const m: Celdas = new Map();
  filas.forEach((f, y) => [...f].forEach((ch, x) => { if (colores[ch]) m.set(clave(x + 1, y + 1), colores[ch]); }));
  return aPx(borde ? new Map([...[...contorno(m)].map(([k]) => [k, borde] as const), ...m]) : m);
}

export interface CapaArma { id: string; px: Px[]; oculta?: boolean }
interface DefArma {
  nombre: string;
  /** x donde empieza el puño que la empuña (por defecto 20, la mano del sprite). */
  mano?: number;
  dibujar: () => { base: Celdas; extra?: { id: string; m: Celdas; oculta?: boolean; sinContorno?: boolean }[] };
}

const MADERA = { a: "#C08A4A", b: "#8B5A2B", c: "#5C3A1A" };

export const ARMAS: Record<string, DefArma> = {
  arma_espada: {
    nombre: "Espada",
    dibujar: () => {
      const { m, pon, caja } = lienzo();
      // hoja ancha (3 px) con filo brillante y punta
      pon(22, -2, "#FFFFFF");
      caja(21, -1, 3, 1, "#E8E8F0");
      for (let y = 0; y <= 17; y++) { pon(21, y, "#FFFFFF"); pon(22, y, "#D8D8E4"); pon(23, y, ACERO.b); }
      caja(22, 2, 1, 13, "#A3A3AE"); // acanaladura
      // guarda dorada con gemas en las puntas
      caja(17, 18, 11, 1, ORO); caja(17, 19, 11, 1, ORO2); pon(17, 18, "#E04848"); pon(27, 18, "#E04848");
      caja(20, 18, 5, 1, ORO3);
      // empuñadura y pomo
      caja(21, 20, 3, 6, MADERA.c); pon(22, 24, MADERA.b);
      caja(21, 26, 3, 2, ORO); pon(22, 26, ORO3);
      return { base: m };
    },
  },
  arma_arco: {
    nombre: "Arco",
    mano: 24,
    dibujar: () => {
      const arco = lienzo();
      // arco delante del cuerpo: vientre en x25–26 (la mano lo empuña ahí), puntas recurvas hacia x21
      for (let y = 7; y <= 35; y++) {
        const t = (y - 21) / 14;
        const x = 21 + Math.round(4 * (1 - t * t));
        arco.pon(x, y, "#D9A066"); arco.pon(x + 1, y, "#A86F3C");
        if (Math.abs(t) > 0.8) arco.pon(x + 1, y, MADERA.c);
      }
      arco.pon(20, 6, MADERA.c); arco.pon(20, 36, MADERA.c); arco.pon(21, 6, "#D9A066"); arco.pon(21, 36, "#D9A066");
      arco.caja(25, 19, 2, 5, "#8E1F1F"); arco.caja(25, 20, 1, 3, "#E04848");
      const suelta = lienzo();
      for (let y = 8; y <= 34; y++) suelta.pon(21, y, "#FFF6D8");
      // flecha preparada (en reposo)
      const cargada = lienzo();
      cargada.caja(21, 21, 13, 1, "#D9A066");
      cargada.caja(34, 20, 1, 3, ACERO.c); cargada.pon(35, 21, "#FFFFFF"); cargada.pon(33, 21, ACERO.a);
      for (const x of [19, 20, 21]) { cargada.pon(x, 20, "#E04848"); cargada.pon(x, 22, "#E04848"); }
      // cuerda tensa en V hasta la mano de atrás y la flecha retraída
      const cuerdaTensa = lienzo();
      for (let y = 8; y <= 34; y++) cuerdaTensa.pon(21 - Math.round(7 * (1 - Math.abs(y - 21) / 13)), y, "#FFF6D8");
      const tensa = lienzo();
      tensa.caja(14, 21, 14, 1, "#D9A066");
      tensa.caja(28, 20, 1, 3, ACERO.c); tensa.pon(29, 21, "#FFFFFF"); tensa.pon(27, 21, ACERO.a);
      for (const x of [12, 13, 14]) { tensa.pon(x, 20, "#E04848"); tensa.pon(x, 22, "#E04848"); }
      return {
        base: arco.m,
        extra: [
          { id: "cuerda-suelta", m: suelta.m },
          { id: "flecha-cargada", m: cargada.m },
          { id: "cuerda-tensa", m: cuerdaTensa.m, oculta: true, sinContorno: true },
          { id: "flecha-tensa", m: tensa.m, oculta: true },
        ],
      };
    },
  },
  arma_baculo: {
    nombre: "Báculo",
    dibujar: () => {
      const { m, pon, caja } = lienzo();
      caja(22, -3, 1, 36, MADERA.b); caja(23, -3, 1, 36, MADERA.c);
      for (let y = 0; y < 33; y += 5) pon(22, y, MADERA.a);
      caja(22, 33, 2, 1, ACERO.d);
      // garras doradas que sujetan la gema
      caja(20, -5, 6, 1, ORO); caja(21, -4, 4, 1, ORO2); pon(22, -5, ORO3);
      caja(18, -9, 1, 3, ORO); pon(19, -6, ORO); pon(19, -7, ORO2);
      caja(27, -9, 1, 3, ORO); pon(26, -6, ORO); pon(26, -7, ORO2);
      // gema
      const filas: [number, string][] = [[-11, "......CC......"], [-10, ".....CWCc....."], [-9, "....CWCCcc...."], [-8, "....CCCCcc...."], [-7, ".....CCcc....."], [-6, "......cc......"]];
      const col: Record<string, string> = { C: "#8FB8FF", W: "#FFFFFF", c: "#3F7FE0" };
      const brillo = lienzo();
      for (const [y, f] of filas) [...f].forEach((ch, i) => {
        if (col[ch]) { pon(16 + i, y, col[ch]); brillo.pon(16 + i, y, ch === "c" ? "#D6E6FF" : "#FFFFFF"); }
      });
      return { base: m, extra: [{ id: "gema-brillo", m: brillo.m, oculta: true, sinContorno: true }] };
    },
  },
  arma_martillo: {
    nombre: "Martillo",
    dibujar: () => {
      const { m, pon, caja } = lienzo();
      caja(22, 4, 1, 27, MADERA.b); caja(23, 4, 1, 27, MADERA.c);
      for (let y = 6; y < 30; y += 3) pon(22, y, MADERA.a);
      caja(22, 31, 2, 2, ACERO.d);
      // cabeza de acero de 16×9 con caras de golpe y banda dorada
      for (let y = -5; y <= 3; y++) for (let x = 15; x <= 30; x++) {
        if ((x === 15 || x === 30) && (y === -5 || y === 3)) continue; // esquinas biseladas
        const cara = x <= 16 || x >= 29;
        let c = y === -5 ? "#E8E8F0" : y === 3 ? ACERO.d : cara ? ACERO.b : ACERO.a;
        if (cara && y !== -5 && y !== 3) c = x === 15 || x === 30 ? ACERO.d : ACERO.b;
        if (x >= 21 && x <= 24) c = y === -5 ? ORO3 : y === 3 ? ORO2 : ORO;
        pon(x, y, c);
      }
      caja(17, -4, 3, 1, "#FFFFFF"); pon(26, -1, ACERO.d); pon(19, -1, ACERO.d); pon(22, -1, "#E04848"); pon(23, -1, "#E04848");
      caja(22, -7, 2, 2, ACERO.a); pon(22, -7, "#E8E8F0"); // pincho superior
      return { base: m };
    },
  },
  arma_katana: {
    nombre: "Katana",
    dibujar: () => {
      const { m, pon, caja } = lienzo();
      // hoja larga y fina en diagonal hacia delante, con una curva suave
      for (let i = 0; i <= 23; i++) {
        const y = 19 - i;
        const x = 23 + Math.round(i * 0.42 + i * i * 0.006);
        pon(x, y, "#FFFFFF");
        if (i < 22) pon(x + 1, y, "#D8D8E4");
        if (i < 20) pon(x + 2, y, ACERO.b);
      }
      // tsuba (guarda redonda)
      caja(21, 19, 5, 1, ORO2); caja(22, 18, 3, 3, ORO); pon(22, 18, ORO3);
      // mango con trenzado en rombos, hacia atrás y abajo
      for (let i = 1; i <= 7; i++) {
        const y = 20 + i;
        const x = 23 - Math.round(i * 0.45);
        pon(x - 1, y, i % 2 ? "#1B1F3B" : "#F0F0F8"); pon(x, y, i % 2 ? "#F0F0F8" : "#E04848");
      }
      caja(19, 28, 2, 1, ORO);
      return { base: m };
    },
  },
};

/** Capas ya resueltas de un arma (para el héroe y para su ícono). */
export function capasArma(id: string, opciones: { guante?: boolean; mano?: boolean } = {}): CapaArma[] {
  const def = ARMAS[id];
  if (!def) return [];
  const { base, extra = [] } = def.dibujar();
  const capas: CapaArma[] = [{ id: "base", px: aPx(new Map([...contorno(base), ...base])) }];
  for (const e of extra) {
    const borde = e.sinContorno ? new Map<string, string>() : contorno(e.m, base);
    capas.push({ id: e.id, px: aPx(new Map([...borde, ...e.m])), oculta: e.oculta });
  }
  if (opciones.mano !== false) {
    const p = punio(!!opciones.guante, def.mano);
    capas.push({ id: "mano", px: aPx(new Map([...contorno(p), ...p])) });
  }
  return capas;
}

/** Caja [x, y, ancho, alto] de lo visible en reposo (para recortar el ícono). */
export function cajaArma(capas: CapaArma[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of capas) if (!c.oculta) for (const [x, y, w, h] of c.px) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h);
  }
  return [x0, y0, x1 - x0, y1 - y0];
}

/** La capa del arma del héroe: un SVG propio más grande que el cuerpo. */
function CapaArmaSvg({ id, guante }: { id: string; guante: boolean }) {
  const capas = capasArma(id, { guante });
  return (
    <svg className={`heroe-capa heroe-arma ataque-${tipoAtaque(id)}`} data-arma={id}
      viewBox={`${VB_ARMA.x} ${VB_ARMA.y} ${VB_ARMA.lado} ${VB_ARMA.lado}`} shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      {capas.map((c) => (
        <g key={c.id} className={`arma-${c.id}`} data-capa={c.id}>
          {c.px.map(([x, y, w, h, col], i) => <rect key={i} x={x} y={y} width={w} height={h} fill={col} />)}
        </g>
      ))}
    </svg>
  );
}

// ---- Cosméticos por tier ----

const BANDANA: Px[] = [[12, 7, 8, 1, "#E04848"], [12, 8, 8, 1, "#8E1F1F"], [14, 7, 1, 1, "#FF8A8A"], [20, 8, 1, 1, "#E04848"], [21, 8, 1, 1, "#8E1F1F"], [21, 9, 2, 1, "#E04848"], [22, 10, 1, 1, "#8E1F1F"]];

const pelo = (a: string, b: string, brillo: string): Px[] => [[14, 5, 4, 1, a], [12, 6, 8, 1, a], [12, 9, 1, 1, b], [19, 9, 1, 1, b], [15, 5, 1, 1, brillo], [13, 6, 1, 1, brillo]];

function hombreras(m: { a: string; b: string; c: string }, ancho: boolean): Px[] {
  const e = ancho ? 1 : 0;
  return [
    [8 - e, 15, 5 + e, 1, O], [7 - e, 16, 1, 2, O], [8 - e, 16, 5 + e, 1, m.a], [8 - e, 17, 5 + e, 1, m.b], [8 - e, 18, 5 + e, 1, O], [9 - e, 16, 1, 1, m.c],
    [19, 15, 5 + e, 1, O], [24 + e, 16, 1, 2, O], [19, 16, 5 + e, 1, m.a], [19, 17, 5 + e, 1, m.b], [19, 18, 5 + e, 1, O], [22 + e, 16, 1, 1, m.c],
  ];
}

const CASCO: Px[] = [
  [13, 2, 6, 1, O], [12, 3, 1, 1, O], [19, 3, 1, 1, O], [11, 4, 1, 4, O], [20, 4, 1, 4, O],
  [13, 3, 6, 1, ACERO.a], [12, 4, 8, 3, ACERO.a], [12, 7, 8, 1, ACERO.b], [14, 3, 2, 1, ACERO.c], [13, 4, 1, 2, ACERO.c],
  [15, 8, 2, 2, ACERO.b], [12, 6, 1, 1, ACERO.d], [19, 6, 1, 1, ACERO.d],
];
const PENACHO: Px[] = [[15, 0, 2, 2, "#E04848"], [16, 0, 1, 1, "#FF8A8A"], [17, 1, 1, 1, "#8E1F1F"]];
const CORONA: Px[] = [
  [11, 1, 1, 2, O], [20, 1, 1, 2, O], [12, 0, 1, 1, ORO], [15, 0, 2, 1, ORO], [19, 0, 1, 1, ORO],
  [12, 1, 8, 2, ORO], [12, 2, 8, 1, ORO2], [13, 2, 1, 1, "#E04848"], [16, 1, 1, 1, "#3F7FE0"], [18, 2, 1, 1, "#58C94A"], [15, 0, 1, 1, ORO3],
];
const CAPA_TIER = { a: "#B83A3A", b: "#8E1F1F" };

/** Qué cosméticos de evolución lleva un tier (útil para la UI y los tests). */
export function cosmeticosTier(tier: number) {
  const t = Math.max(1, Math.min(6, Math.floor(tier) || 1));
  return { bandana: t >= 2, pelo: t >= 3, hombreras: t >= 3, casco: t >= 4, capa: t >= 5, fuerte: t >= 5, corona: t >= 6 };
}

/** Las capas del héroe ya resueltas (las usa el componente y los íconos). */
export function capasHeroe(tier: number, equipo?: Equipo | null) {
  const t = Math.max(1, Math.min(6, Math.floor(tier) || 1));
  const c = cosmeticosTier(t);
  const ropa = equipo?.ropa ? ROPAS[equipo.ropa] : undefined;
  const tela = ropa?.tela ?? TELA_TIER[t];
  const detras: Px[] = [];
  const capaColor = ropa?.capa ?? (c.capa ? (ropa ? { a: ropa.tela.a, b: ropa.tela.b } : CAPA_TIER) : undefined);
  if (capaColor) detras.push(...capaTrasera(capaColor, (capaColor as { ribete?: string }).ribete ?? (t >= 6 ? ORO : undefined)));

  const ropaPx: Px[] = tela ? [...torso(tela), ...(ropa?.extra ?? [])] : [];
  // Los atuendos de tier 5–6 traen un aura que tapa la capa trasera: sus orillas se pintan delante.
  if (capaColor && t >= 5)
    ropaPx.unshift([6, 17, 1, 13, O], [7, 16, 2, 14, capaColor.a], [7, 18, 1, 12, capaColor.b], [6, 30, 3, 1, O],
      [25, 17, 1, 13, O], [23, 16, 2, 14, capaColor.a], [24, 18, 1, 12, capaColor.b], [23, 30, 3, 1, O]);
  if (c.fuerte && tela) ropaPx.push([8, 19, 1, 3, O], [9, 19, 1, 3, tela.a], [23, 19, 1, 3, O], [22, 19, 1, 3, tela.a]); // brazos más gruesos

  const armaduraPx = equipo?.armadura ? ARMADURAS[equipo.armadura]?.px ?? [] : [];

  const acc: { id: string; px: Px[] }[] = [];
  if (c.pelo) acc.push({ id: "pelo", px: t >= 5 ? pelo("#E8E8F0", "#A3A3AE", "#FFFFFF") : pelo("#C85A1E", "#8A3A12", "#F2A81D") });
  if (c.bandana) acc.push({ id: "bandana", px: BANDANA });
  if (c.hombreras) acc.push({ id: "hombreras", px: hombreras(t >= 5 ? { a: ORO, b: ORO2, c: ORO3 } : ACERO, c.fuerte) });
  if (c.casco) acc.push({ id: "casco", px: [...CASCO, ...(c.corona ? [] : PENACHO)] });
  if (c.corona) acc.push({ id: "corona", px: CORONA });
  if (c.capa) acc.push({ id: "capa", px: [] }); // la capa se dibuja detrás; se marca para la UI

  const arma = equipo?.arma && ARMAS[equipo.arma] ? equipo.arma : null;
  return { tier: t, cosmeticos: c, detras, ropa: ropaPx, armadura: armaduraPx, accesorios: acc, arma };
}

// ---- Respaldo: el atuendo Brote dibujado a mano (si el sprite no carga) ----

const BASE_FILAS = [
  "................................", "..............aa.bb.............", "...............acb..............", "................c...............",
  "..............dddd..............", "............ddeeeedd............", "...........deeeeeeeed...........", "...........daaaaaaaadd..........",
  "...........daaaaaaaadbd.........", "...........deffffffeddbd........", "...........dfgdffgdfd.d.........", "...........dfgdffgdfd...........",
  "...........dhffffffhd...........", "...........dhffiiffhd...........", "............ddffffdd............", ".............ddffdd.............",
  "...........ddjjjjjjdd...........", "..........dkkjjjjjjkkd..........", ".........dkkdkjjjjkdkkd.........", ".........dkkdkkjkkkdkkd.........",
  ".........dkkdkkkkkkdkkd.........", ".........dlldlkkkkldlld.........", ".........dffdeeemeedffd.........", "..........dddllllllddd..........",
  "............deeddeed............", "............deeddeed............", "............deeddeed............", "............deeddeed............",
  "............deeddeed............", "...........deeeddeeed...........", "...........deeeddeeeed..........", "...........ddddddddddd..........",
];
const BASE_COL: Record<string, string> = {
  a: "#6BBF59", b: "#3E8E41", c: "#2C5E2E", d: O, e: "#5C3A1A", f: PIEL, g: "#FFF6D8", h: "#C8905A", i: "#8E1F1F", j: "#D8D0B8", k: "#A86F3C", l: "#8B5A2B", m: ORO,
};
const BASE_PX: Px[] = BASE_FILAS.flatMap((f, y) => [...f].flatMap((ch, x): Px[] => (BASE_COL[ch] ? [[x, y, 1, 1, BASE_COL[ch]]] : [])));

// ---------------------------------------------------------------------------------------------

export interface PropsHeroe {
  tier: number;
  equipo?: Equipo | null;
  /** El contrato pide idle/feliz/caminar; también acepta el resto de `Anim` (se ven como idle + CSS). */
  anim?: "idle" | "feliz" | "caminar" | Anim;
  escala?: number;
  alt: string;
  className?: string;
}

export function HeroeEquipado(props: PropsHeroe) {
  const { tier, equipo, anim = "idle", escala = 3, alt, className = "" } = props;
  const capas = capasHeroe(tier, equipo);
  const src = spriteUrl(spriteHeroe(capas.tier), "idle", 1);
  const [fallo, setFallo] = useState(false);
  useEffect(() => setFallo(false), [src]);
  const lado = 32 * Math.max(1, Math.round(escala));
  const acc = capas.accesorios.map((a) => a.id).join(" ");

  return (
    <span
      className={`heroe-equipado ${capas.cosmeticos.fuerte ? "heroe-fuerte" : ""} ${className}`}
      style={{ "--heroe-lado": `${lado}px` } as CSSProperties}
      data-tier={capas.tier}
      data-anim={anim}
      data-ropa={equipo?.ropa ?? "ninguna"}
      data-armadura={equipo?.armadura ?? "ninguna"}
      data-accesorios={acc || "ninguno"}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      <span className="heroe-fig">
        {capas.detras.length > 0 && <Pixeles px={capas.detras} className="heroe-capa heroe-capa-trasera" />}
        {fallo ? (
          <Pixeles px={BASE_PX} className="heroe-capa heroe-base" />
        ) : (
          <img className="heroe-capa heroe-base" src={src} alt="" width={lado} height={lado} draggable={false} onError={() => setFallo(true)} />
        )}
        {capas.ropa.length > 0 && <Pixeles px={capas.ropa} className="heroe-capa heroe-ropa" />}
        {capas.armadura.length > 0 && <Pixeles px={capas.armadura} className="heroe-capa heroe-armadura" />}
        {capas.accesorios.filter((a) => a.px.length > 0).map((a) => (
          <Pixeles key={a.id} px={a.px} className={`heroe-capa heroe-acc heroe-acc-${a.id}`} data-acc={a.id} />
        ))}
        {capas.arma ? (
          <CapaArmaSvg id={capas.arma} guante={equipo?.armadura === "armadura_placas"} />
        ) : (
          <span className="heroe-capa heroe-arma ataque-punio" data-arma="ninguna" aria-hidden="true" />
        )}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Íconos de tienda/inventario para los equipables
// ---------------------------------------------------------------------------------------------

const MANIQUI: Px[] = [
  [12, 15, 8, 1, O], [9, 16, 14, 7, O], [12, 23, 8, 1, O], [12, 24, 8, 5, O], [15, 29, 2, 2, O], [12, 30, 8, 1, O],
  [10, 17, 2, 4, "#C08A4A"], [20, 17, 2, 4, "#C08A4A"], [13, 16, 6, 7, "#C08A4A"], [13, 24, 2, 4, "#A86F3C"], [17, 24, 2, 4, "#A86F3C"], [15, 23, 2, 6, "#8B5A2B"],
];

export const EQUIPABLES = [...Object.keys(ARMAS), ...Object.keys(ARMADURAS), ...Object.keys(ROPAS)];
export const esEquipable = (id: string) => id in ARMAS || id in ARMADURAS || id in ROPAS;
export const nombreEquipable = (id: string): string | undefined => ARMAS[id]?.nombre ?? ARMADURAS[id]?.nombre ?? ROPAS[id]?.nombre;

/** Ícono pixel del equipable (arma recortada; armadura/ropa sobre un maniquí de madera). */
export function IconoEquipable({ id, tam = 64 }: { id: string; tam?: number }) {
  let px: Px[] = [];
  let vb = "6 12 20 20";
  if (ARMAS[id]) {
    const capas = capasArma(id, { mano: false });
    const [x, y, w, h] = cajaArma(capas);
    const lado = Math.max(w, h);
    vb = `${x - (lado - w) / 2} ${y - (lado - h) / 2} ${lado} ${lado}`;
    px = capas.filter((c) => !c.oculta).flatMap((c) => c.px);
  } else if (ARMADURAS[id]) {
    px = [...MANIQUI, ...ARMADURAS[id].px];
  } else if (ROPAS[id]) {
    const r = ROPAS[id];
    px = [...(r.capa ? capaTrasera(r.capa, r.capa.ribete) : []), ...MANIQUI, ...torso(r.tela), ...(r.extra ?? [])];
  }
  return (
    <svg className="pix icono-equipable" viewBox={vb} width={tam} height={tam} shapeRendering="crispEdges" aria-hidden="true" data-equipable={id}>
      {px.map(([x, y, w, h, c], i) => <rect key={i} x={x} y={y} width={w} height={h} fill={c} />)}
    </svg>
  );
}
