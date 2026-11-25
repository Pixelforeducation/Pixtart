/**
 * Personajes en escena. El arte real viene SIEMPRE de `src/arte` (agente arte); si un sprite aún no
 * existe en este árbol (placeholder roto), se dibuja una figura pixel provisional para que la escena
 * no quede con un ícono de imagen rota. En cuanto el arte llegue, se ve el sprite real.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Sprite, type Anim } from "../../arte";

type Rol = "anfitrion" | "heroe" | "mascota";

interface Props {
  nombre: string;
  rol: Rol;
  anim?: Anim;
  escala?: number;
  alt: string;
  className?: string;
  /** Figura alternativa si el sprite no carga. */
  respaldo?: ReactNode;
}

export function Personaje({ nombre, rol, anim = "idle", escala = 3, alt, className = "", respaldo }: Props) {
  const [fallo, setFallo] = useState(false);
  useEffect(() => setFallo(false), [nombre]);
  return (
    <span className={`jg-personaje jg-rol-${rol} ${className}`} data-anim={anim} onError={() => setFallo(true)}>
      {fallo ? (respaldo ?? <FiguraPixel rol={rol} variante={nombre} escala={escala} alt={alt} />) : <Sprite nombre={nombre} anim={anim} escala={escala} alt={alt} />}
    </span>
  );
}

// ---- Figuras provisionales (12×12) ----
type Mapa = Record<string, string>;
const FIG: Record<string, { filas: string[]; colores: Mapa }> = {
  buho: {
    filas: [
      "..o......o..",
      "..oo....oo..",
      "..obbbbbbo..",
      ".obbbbbbbbo.",
      ".bggbbbbggb.",
      ".gwkgbbgwkg.",
      ".bggbyybggb.",
      ".bcbbyybbcb.",
      "obccccccccbo",
      "obccccccccbo",
      ".obbbbbbbbo.",
      "...yy..yy...",
    ],
    colores: { o: "#2A1A0E", b: "#8B5A2B", c: "#C08A4A", g: "#F2C230", w: "#FFF6D8", k: "#1B1F3B", y: "#F2A81D" },
  },
  mago: {
    filas: [
      ".....pp.....",
      "....ppps....",
      "...pppppp...",
      "..pppppppp..",
      ".oooooooooo.",
      "...ssssss...",
      "...skssks...",
      "...wwwwww...",
      "..pwwwwwwp..",
      ".pppwwwwppp.",
      ".pppppppppp.",
      "..oo....oo..",
    ],
    colores: { p: "#5B3FA8", s: "#C08A4A", k: "#14102A", w: "#FFF6D8", o: "#3A2670" },
  },
  alquimista: {
    filas: [
      "...oooooo...",
      "..oggggggo..",
      "..gssssssg..",
      "..sbwsswbs..",
      "..ssssssss..",
      "...ssmmss...",
      "..vvvvvvvv..",
      ".vvvvaavvvv.",
      ".vsvvaavvsv.",
      ".vvvvvvvvvv.",
      "..vvvvvvvv..",
      "..oo....oo..",
    ],
    colores: { o: "#2A1A0E", g: "#7A7A86", s: "#C08A4A", b: "#8FB8FF", w: "#FFF6D8", m: "#5C3A1A", v: "#2C5E2E", a: "#58C94A" },
  },
  heroe: {
    filas: [
      "...hhhhhh...",
      "..hhhhhhhh..",
      "..hssssssh..",
      "..sskssks...",
      "..ssssssss..",
      "...ssmmss...",
      "..tttttttt..",
      ".stttbbttts.",
      ".sttttttttsx",
      "..tttttttt.x",
      "..mm....mm..",
      "..oo....oo..",
    ],
    colores: { h: "#5C3A1A", s: "#C08A4A", k: "#1B1F3B", m: "#8B5A2B", t: "#3E8E41", b: "#F2C230", o: "#2A1A0E", x: "#A3A3AE" },
  },
  mascota: {
    filas: [
      "............",
      "..o......o..",
      "..ao....oa..",
      "..aaaaaaaa..",
      ".aaaaaaaaaa.",
      ".awkaaaawka.",
      ".aaaaccaaaa.",
      ".aaaaaaaaaa.",
      "..aaaaaaaa..",
      "..aaaaaaaa..",
      "...a....a...",
      "............",
    ],
    colores: { o: "#2B2F55", a: "#8FB8FF", w: "#FFF6D8", k: "#1B1F3B", c: "#F2A81D" },
  },
};

function figuraDe(rol: Rol, variante: string) {
  if (rol === "heroe") return FIG.heroe;
  if (rol === "mascota") {
    const v = variante.toLowerCase();
    if (v.includes("fox") || v.includes("zorro")) return { ...FIG.mascota, colores: { ...FIG.mascota.colores, a: "#F2A81D", c: "#E04848" } };
    if (v.includes("golem")) return { ...FIG.mascota, colores: { ...FIG.mascota.colores, a: "#A3A3AE", c: "#58C94A" } };
    return FIG.mascota;
  }
  const v = variante.toLowerCase();
  if (v.includes("mag") || v.includes("mage")) return FIG.mago;
  if (v.includes("alqu") || v.includes("alch")) return FIG.alquimista;
  return FIG.buho;
}

export function FiguraPixel({ rol, variante = "", escala = 3, alt }: { rol: Rol; variante?: string; escala?: number; alt: string }) {
  const { filas, colores } = figuraDe(rol, variante);
  const lado = 32 * escala;
  return (
    <svg className="jg-figura" viewBox="-2 -2 16 16" width={lado} height={lado} shapeRendering="crispEdges"
      role={alt ? "img" : undefined} aria-hidden={alt ? undefined : true} aria-label={alt || undefined}>
      {filas.flatMap((f, y) => [...f].map((ch, x) => (ch !== "." && colores[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={colores[ch]} /> : null)))}
    </svg>
  );
}
