/**
 * Piezas del HUD del marco: contador animado, llama de racha, anillo de meta diaria,
 * estrella y castillo pixel-art. Todo respeta la intensidad de animación (useIntensidad).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useIntensidad } from "./index";

type Mapa = { filas: string[]; col: Record<string, string> };

function Pix({ filas, col, tam, className }: Mapa & { tam: number; className?: string }) {
  const w = filas[0].length, h = filas.length;
  return (
    <svg className={`pix ${className ?? ""}`} viewBox={`0 0 ${w} ${h}`} width={tam} height={(tam * h) / w} shapeRendering="crispEdges" aria-hidden="true">
      {filas.flatMap((f, y) => [...f].map((ch, x) => (col[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={col[ch]} /> : null)))}
    </svg>
  );
}

/** Número que cuenta hasta su valor nuevo (ease-out, ~0.6 s) y avisa con `salta`. */
export function Contador({ valor, className }: { valor: number; className?: string }) {
  const int = useIntensidad();
  const [mostrado, setMostrado] = useState(valor);
  const [cambio, setCambio] = useState(0);
  const previo = useRef(valor);
  useEffect(() => {
    const desde = previo.current;
    previo.current = valor;
    if (desde === valor) return;
    setCambio((c) => c + 1);
    if (int === 0 || typeof requestAnimationFrame === "undefined") { setMostrado(valor); return; }
    const t0 = performance.now(), dur = 650;
    let raf = 0;
    const paso = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setMostrado(Math.round(desde + (valor - desde) * e));
      if (k < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor, int]);
  return <span key={cambio} className={`num ${cambio ? "salta" : ""} ${className ?? ""}`}>{mostrado.toLocaleString("es-MX")}</span>;
}

const LLAMA: Mapa = {
  filas: [
    "....a....",
    "...aa....",
    "...aba...",
    "..abba.a.",
    ".abbbbaa.",
    ".abccbba.",
    "abbccbbba",
    "abccdccba",
    "abcddccba",
    "abcdddcba",
    ".abcddcba",
    "..abccba.",
    "...aaaa..",
  ],
  col: { a: "#8E1F1F", b: "#E8532A", c: "#FFA62B", d: "#FFF1A0" },
};
const LLAMA_APAGADA: Mapa = { filas: LLAMA.filas, col: { a: "#2A1A0E", b: "#4A4A55", c: "#7A7A86", d: "#A3A3AE" } };

/** Llama de racha: más grande y viva cuanto mayor es la racha; gris si es 0. */
export function Llama({ racha, tam = 24 }: { racha: number; tam?: number }) {
  const viva = racha > 0;
  const nivel = racha >= 30 ? 3 : racha >= 7 ? 2 : racha > 0 ? 1 : 0;
  return (
    <span className={`llama llama-n${nivel}`} aria-hidden="true">
      <Pix {...(viva ? LLAMA : LLAMA_APAGADA)} tam={tam} />
      {viva && <span className="llama-chispa" />}
    </span>
  );
}

/** Anillo de progreso pixelado (meta diaria). `hechos/meta` con marcas por cada unidad. */
export function AnilloMeta({ hechos, meta, tam = 64, children }: { hechos: number; meta: number; tam?: number; children?: ReactNode }) {
  const r = 26, c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, meta ? hechos / meta : 0));
  return (
    <span className={`anillo-meta ${f >= 1 ? "lleno" : ""}`} style={{ width: tam, height: tam }}>
      <svg viewBox="0 0 64 64" width={tam} height={tam} aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--c-borde)" strokeWidth="10" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="6" />
        <circle className="anillo-meta-arco" cx="32" cy="32" r={r} fill="none" stroke="url(#grad-meta)" strokeWidth="6"
          strokeDasharray={`${c} ${c}`} style={{ strokeDashoffset: c * (1 - f) }} transform="rotate(-90 32 32)" strokeLinecap="butt" />
        {Array.from({ length: meta }, (_, i) => {
          const a = (i / meta) * 2 * Math.PI - Math.PI / 2;
          return <rect key={i} x={32 + Math.cos(a) * r - 2} y={32 + Math.sin(a) * r - 4} width="4" height="8" fill="var(--c-borde)"
            transform={`rotate(${(i / meta) * 360} ${32 + Math.cos(a) * r} ${32 + Math.sin(a) * r})`} />;
        })}
        <defs>
          <linearGradient id="grad-meta" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFF1A0" /><stop offset="0.5" stopColor="#F2C230" /><stop offset="1" stopColor="#E07A1D" />
          </linearGradient>
        </defs>
      </svg>
      <span className="anillo-meta-centro">{children}</span>
    </span>
  );
}

const ESTRELLA: Mapa = {
  filas: ["....a....", "...aba...", "...aba...", "aaabbbaaa", "abbbcbbba", ".abbbbba.", "..abbba..", ".abbabba.", ".aba.aba.", ".aa...aa."],
  col: { a: "#5C3A1A", b: "#F2C230", c: "#FFF1A0" },
};
export const Estrella = ({ tam = 18, apagada = false }: { tam?: number; apagada?: boolean }) => (
  <Pix {...(apagada ? { ...ESTRELLA, col: { a: "#2A1A0E", b: "#4A4A55", c: "#7A7A86" } } : ESTRELLA)} tam={tam} />
);

const CASTILLO: Mapa = {
  filas: [
    "......f.........",
    "......ff........",
    "......a.........",
    "a.a..aaa..a.a...",
    "aaa..aba..aaa...",
    "aba..aba..aba...",
    "abaaaaaaaaaba...",
    "abbbbbbbbbbba...",
    "abcbbbbbbbcba...",
    "abbbbaaabbbba...",
    "abbbadddabbba...",
    "abbbadddabbba...",
    "aaaaaaaaaaaaa...",
  ].map((f) => f.slice(0, 13)),
  col: { a: "#2A1A0E", b: "#7A7A86", c: "#FFD23F", d: "#4A2410", f: "#E04848" },
};
export const Castillo = ({ tam = 96, apagado = false }: { tam?: number; apagado?: boolean }) => (
  <Pix {...(apagado ? { ...CASTILLO, col: { ...CASTILLO.col, b: "#4A4A55", c: "#2B2F55", f: "#7A7A86" } } : CASTILLO)} tam={tam} className="castillo-pix" />
);
