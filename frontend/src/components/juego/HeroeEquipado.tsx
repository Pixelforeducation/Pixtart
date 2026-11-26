/**
 * Héroe con su equipo (v0.3, mejoras 5 y 9).
 *
 * Se apilan capas SVG de 32×32 sobre el sprite del tier (todos los atuendos de
 * `herramientas/generar_sprites.py` comparten el mismo cuerpo: cabeza x11–20 y4–15, torso y16–23,
 * manos en (10–11, 22) y (20–21, 22), piernas y24–31), así que las capas encajan en cualquier tier:
 *
 *   capa (detrás) → sprite base → ropa → armadura → cosméticos de tier → arma (`.heroe-arma`)
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

// ---- Armas (la mano libre está en (20–21, 22); el arma se toma en x22) ----

interface DefArma { nombre: string; px: Px[]; caja: [number, number, number, number] }

export const ARMAS: Record<string, DefArma> = {
  arma_espada: {
    nombre: "Espada",
    caja: [17, 5, 10, 21],
    px: [
      [22, 6, 1, 1, O], [21, 7, 1, 1, O], [23, 7, 1, 1, O], [22, 7, 1, 1, "#FFFFFF"],
      [21, 8, 1, 12, O], [23, 8, 1, 12, O], [22, 8, 1, 12, "#D8D8E4"], [22, 9, 1, 4, "#FFFFFF"],
      [19, 19, 7, 1, O], [19, 20, 7, 1, ORO], [19, 21, 7, 1, ORO2], [18, 20, 1, 2, O], [26, 20, 1, 2, O],
      [21, 22, 1, 2, O], [23, 22, 1, 2, O], [22, 22, 1, 2, "#5C3A1A"], [22, 24, 1, 1, ORO], [21, 24, 1, 1, O], [23, 24, 1, 1, O], [22, 25, 1, 1, O],
    ],
  },
  arma_arco: {
    nombre: "Arco",
    caja: [19, 12, 9, 20],
    px: [
      [22, 15, 1, 15, "#FFF6D8"], // cuerda
      [23, 13, 1, 2, "#A86F3C"], [24, 15, 1, 2, "#A86F3C"], [25, 17, 1, 11, "#A86F3C"], [24, 28, 1, 2, "#A86F3C"], [23, 30, 1, 2, "#A86F3C"],
      [24, 13, 1, 2, "#5C3A1A"], [25, 15, 1, 2, "#5C3A1A"], [26, 17, 1, 11, "#5C3A1A"], [25, 28, 1, 2, "#5C3A1A"], [24, 30, 1, 2, "#5C3A1A"],
      [22, 13, 1, 2, O], [22, 30, 1, 2, O], [25, 21, 1, 3, "#8E1F1F"],
      // flecha preparada
      [20, 22, 5, 1, "#A86F3C"], [19, 21, 1, 3, "#FFF6D8"], [25, 22, 1, 1, ACERO.a], [26, 22, 1, 1, ACERO.c],
    ],
  },
  arma_baculo: {
    nombre: "Báculo",
    caja: [17, 2, 11, 29],
    px: [
      [22, 9, 1, 21, "#8B5A2B"], [23, 9, 1, 21, "#5C3A1A"], [22, 30, 2, 1, O],
      [21, 8, 1, 1, ORO2], [24, 8, 1, 1, ORO2], [20, 6, 1, 2, ORO2], [25, 6, 1, 2, ORO2],
      [22, 3, 2, 1, "#8FB8FF"], [21, 4, 4, 3, "#8FB8FF"], [22, 7, 2, 1, "#3F7FE0"], [21, 6, 1, 1, "#3F7FE0"], [24, 6, 1, 1, "#3F7FE0"],
      [22, 4, 1, 2, "#FFFFFF"],
    ],
  },
  arma_martillo: {
    nombre: "Martillo",
    caja: [17, 6, 12, 21],
    px: [
      [22, 13, 1, 12, "#8B5A2B"], [23, 13, 1, 12, "#5C3A1A"], [22, 25, 2, 1, ACERO.d], [22, 26, 2, 1, O],
      [19, 7, 8, 1, O], [19, 13, 8, 1, O], [18, 8, 1, 5, O], [27, 8, 1, 5, O],
      [19, 8, 8, 5, ACERO.b], [19, 8, 8, 1, ACERO.a], [20, 9, 1, 1, ACERO.c], [21, 8, 1, 5, ACERO.d], [24, 8, 1, 5, ACERO.d], [19, 12, 8, 1, ACERO.d],
    ],
  },
  arma_katana: {
    nombre: "Katana",
    caja: [18, 1, 10, 27],
    px: [
      [24, 2, 1, 1, "#FFFFFF"], [24, 3, 1, 6, "#E8E8F0"], [25, 3, 1, 6, ACERO.b], [23, 9, 1, 10, "#E8E8F0"], [24, 9, 1, 10, ACERO.b],
      [25, 2, 1, 1, O], [26, 3, 1, 6, O], [25, 9, 1, 10, O], [23, 2, 1, 7, O], [22, 9, 1, 10, O],
      [21, 19, 5, 1, O], [22, 19, 3, 1, ORO],
      [23, 20, 2, 6, O], [23, 21, 1, 1, "#E04848"], [24, 22, 1, 1, "#E04848"], [23, 23, 1, 1, "#E04848"], [24, 24, 1, 1, "#E04848"],
      [23, 26, 2, 1, ORO],
    ],
  },
};

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
          <Pixeles px={ARMAS[capas.arma].px} className={`heroe-capa heroe-arma ataque-${tipoAtaque(capas.arma)}`} data-arma={capas.arma} />
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
    const [x, y, w, h] = ARMAS[id].caja;
    const lado = Math.max(w, h);
    vb = `${x - (lado - w) / 2} ${y - (lado - h) / 2} ${lado} ${lado}`;
    px = ARMAS[id].px;
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
