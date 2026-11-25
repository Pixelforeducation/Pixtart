import { useContador } from "../../efectos";

interface Props {
  /** Días seguidos jugando (Estado.racha). */
  dias: number;
  /** ¿Ya jugó hoy? Si no, la llama se ve tenue y recuerda (sin regañar) que hoy cuenta. */
  jugadoHoy?: boolean;
  /** Escudos de color: protegen la racha un día cada uno. */
  escudos?: number;
  /** Anima el número desde este valor (p. ej. dias - 1 cuando la racha acaba de subir). */
  desde?: number;
  compacta?: boolean;
}

const FILAS = ["...o...", "..ooo..", "..oyo..", ".oyyyo.", ".oyyyo.", "oyywyyo", "oyywwyo", ".oywwo.", "..ooo.."];
const COLOR: Record<string, string> = { o: "#E04848", y: "#FF9A3C", w: "#FFE27A" };

function LlamaPixel() {
  return (
    <svg viewBox="0 0 7 9" shapeRendering="crispEdges" className="eg-llama-svg">
      {FILAS.flatMap((f, y) => [...f].map((ch, x) => (COLOR[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={COLOR[ch]} className={`eg-p-${ch}`} /> : null)))}
    </svg>
  );
}

/** Tamaño visual de la llama (1..4) según los días: crece la primera semana, el primer mes y los 100. */
export const tamLlama = (dias: number) => (dias >= 100 ? 4 : dias >= 30 ? 3 : dias >= 7 ? 2 : 1);

/** Racha diaria con llama pixel que crece con los días. */
export function RachaLlama({ dias, jugadoHoy = true, escudos = 0, desde, compacta = false }: Props) {
  const n = useContador(dias, { inicial: desde ?? dias, duracion: 700, retraso: 300 });
  const apagada = dias === 0;
  const etiqueta = apagada
    ? "Sin racha todavía: juega un nivel para encender tu llama"
    : `Racha de ${dias} ${dias === 1 ? "día" : "días"}${jugadoHoy ? "" : ", juega hoy para mantenerla"}${escudos ? `, ${escudos} escudo${escudos === 1 ? "" : "s"}` : ""}`;
  return (
    <div className={`eg-racha eg-llama-${tamLlama(dias)} ${jugadoHoy ? "" : "eg-racha-pendiente"} ${apagada ? "eg-racha-apagada" : ""} ${compacta ? "eg-compacta" : ""}`}
      role="img" aria-label={etiqueta}>
      <span className="eg-llama" aria-hidden="true"><LlamaPixel /></span>
      <span className="eg-racha-num" aria-hidden="true" key={n}>{n}</span>
      {!compacta && (
        <span className="eg-racha-txt" aria-hidden="true">
          {apagada ? "¡Enciende tu racha!" : jugadoHoy ? (dias === 1 ? "día seguido" : "días seguidos") : "¡Juega hoy!"}
          {escudos > 0 && <span className="eg-escudos"><b className="eg-escudo" />×{escudos}</span>}
        </span>
      )}
    </div>
  );
}
