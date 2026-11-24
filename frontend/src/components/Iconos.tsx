// Iconos pixel-art originales dibujados con una rejilla de caracteres (8×8 o 10×10).
import type { CSSProperties } from "react";

type Mapa = Record<string, string>;

function Pix({ filas, colores, tam = 24, titulo, estilo }: { filas: string[]; colores: Mapa; tam?: number; titulo?: string; estilo?: CSSProperties }) {
  const w = filas[0].length;
  const h = filas.length;
  const rects: JSX.Element[] = [];
  filas.forEach((f, y) =>
    [...f].forEach((ch, x) => {
      if (ch !== "." && colores[ch]) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={colores[ch]} />);
    }),
  );
  return (
    <svg className="pix" viewBox={`0 0 ${w} ${h}`} width={tam} height={tam} shapeRendering="crispEdges" style={estilo}
      role={titulo ? "img" : undefined} aria-hidden={titulo ? undefined : true} aria-label={titulo}>
      {rects}
    </svg>
  );
}

const CORAZON = [".aa.aa.", "abbaaaa", "abaaaaa", "aaaaaaa", ".aaaaa.", "..aaa..", "...a..."];
export const Corazon = ({ lleno = true, tam = 18 }: { lleno?: boolean; tam?: number }) => (
  <Pix filas={CORAZON} tam={tam} colores={lleno ? { a: "#E04848", b: "#FF8A8A" } : { a: "#4A4A55", b: "#7A7A86" }} />
);

export const Moneda = ({ tam = 18 }: { tam?: number }) => (
  <Pix tam={tam} filas={[".aaaa.", "abbcca", "abccca", "abccca", "acccca", ".aaaa."]} colores={{ a: "var(--c-moneda2)", b: "var(--c-moneda3)", c: "var(--c-moneda)" }} />
);

export const Escudo = ({ tam = 18 }: { tam?: number }) => (
  <Pix tam={tam} filas={["aaaaaaa", "abbcbba", "abbcbba", "accccca", "abbcbba", ".abcba.", "..aaa.."]} colores={{ a: "#2A1A0E", b: "#5FA8E8", c: "#FFF6D8" }} />
);

export const Candado = ({ tam = 18 }: { tam?: number }) => (
  <Pix tam={tam} filas={["..aaa..", ".a...a.", ".a...a.", "bbbbbbb", "bbbcbbb", "bbbcbbb", "bbbbbbb"]} colores={{ a: "#A3A3AE", b: "#C8941A", c: "#2A1A0E" }} titulo="Bloqueado" />
);

export const Engrane = ({ tam = 22 }: { tam?: number }) => (
  <Pix tam={tam} filas={["..a.a..", ".aaaaa.", "aab.baa", ".a...a.", "aab.baa", ".aaaaa.", "..a.a.."]} colores={{ a: "#A3A3AE", b: "#7A7A86" }} />
);

export const Comida = ({ tam = 18 }: { tam?: number }) => (
  <Pix tam={tam} filas={["...c...", "..cc...", ".aaaaa.", "aabaaaa", "abaaaaa", "aaaaaaa", ".aaaaa."]} colores={{ a: "#E04848", b: "#FF8A8A", c: "#3E8E41" }} />
);

export const Pocion = ({ tam = 18 }: { tam?: number }) => (
  <Pix tam={tam} filas={["..aaa..", "..bbb..", "..a.a..", ".a...a.", "acccdca", "accccca", ".aaaaa."]} colores={{ a: "#2A1A0E", b: "#8B5A2B", c: "#8FB8FF", d: "#FFF6D8" }} />
);

const NAV: Record<string, { filas: string[]; colores: Mapa }> = {
  inicio: { filas: ["...a...", "..aaa..", ".aaaaa.", "aaaaaaa", ".bbcbb.", ".bbcbb.", ".bbcbb."], colores: { a: "#E04848", b: "#C08A4A", c: "#2A1A0E" } },
  arena: { filas: ["a.....a", ".a...a.", "..a.a..", "...b...", "..a.a..", ".c...c.", "c.....c"], colores: { a: "#A3A3AE", b: "#F2C230", c: "#8B5A2B" } },
  taller: { filas: ["aaa....", "aba....", "aaab...", "...bb..", "....bb.", ".....bc", "......c"], colores: { a: "#7A7A86", b: "#A86F3C", c: "#5C3A1A" } },
  tienda: { filas: ["aaaaaaa", "babcbab", ".......", ".ddddd.", ".deedd.", ".deedd.", ".ddddd."], colores: { a: "#E04848", b: "#FFF6D8", c: "#E04848", d: "#8B5A2B", e: "#8CC8F0" } },
  perfil: { filas: ["..aaa..", ".abbba.", ".bcbcb.", ".bbbbb.", "..bbb..", ".ddddd.", "ddddddd"], colores: { a: "#3E8E41", b: "#6BBF59", c: "#1B1F3B", d: "#8B5A2B" } },
};
export const IconoNav = ({ nombre }: { nombre: keyof typeof NAV }) => <Pix {...NAV[nombre]} tam={28} />;
