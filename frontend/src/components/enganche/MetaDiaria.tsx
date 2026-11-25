import { useEffect, useRef } from "react";
import { momentos } from "../../efectos";

interface Props {
  /** Unidades hechas hoy (niveles, preguntas…). */
  hechos: number;
  meta?: number;
  unidad?: string;
  /** Tamaño del anillo en px. */
  tam?: number;
  /** Si es true, al pasar de incompleta a completa lanza la celebración (sonido + confeti). */
  celebrar?: boolean;
  onCompletar?: () => void;
}

/** Anillo segmentado de meta diaria (pixel). Al cumplirla brilla en oro. Pasarse no da más presión: solo "¡extra!". */
export function MetaDiaria({ hechos, meta = 3, unidad = "niveles", tam = 88, celebrar = true, onCompletar }: Props) {
  const m = Math.max(1, meta);
  const llenos = Math.max(0, Math.min(m, hechos));
  const completa = hechos >= m;
  const antes = useRef(completa);
  const cb = useRef(onCompletar);
  cb.current = onCompletar;
  useEffect(() => {
    if (completa && !antes.current) {
      if (celebrar) momentos.celebrar();
      cb.current?.();
    }
    antes.current = completa;
  }, [completa, celebrar]);

  // Segmentos como arcos con un hueco entre ellos.
  const r = 36, c = 2 * Math.PI * r, hueco = m > 1 ? 6 : 0, seg = c / m - hueco;
  return (
    <div className={`eg-meta ${completa ? "eg-meta-ok" : ""}`} style={{ ["--tam" as string]: `${tam}px` }}
      role="progressbar" aria-label="Meta diaria" aria-valuemin={0} aria-valuemax={m} aria-valuenow={llenos}
      aria-valuetext={completa ? `Meta cumplida: ${hechos} ${unidad} hoy` : `${llenos} de ${m} ${unidad} hoy`}>
      <svg viewBox="0 0 88 88" width={tam} height={tam} aria-hidden="true" shapeRendering="crispEdges">
        <g transform="rotate(-90 44 44)">
          {Array.from({ length: m }, (_, i) => (
            <circle key={i} cx="44" cy="44" r={r} fill="none" strokeWidth="10"
              className={i < llenos ? "eg-meta-lleno" : "eg-meta-vacio"} style={{ ["--i" as string]: i }}
              strokeDasharray={`${seg} ${c - seg}`} strokeDashoffset={-i * (seg + hueco)} />
          ))}
        </g>
      </svg>
      <span className="eg-meta-centro" aria-hidden="true">
        {completa ? <span className="eg-meta-estrella" /> : <b>{llenos}/{m}</b>}
      </span>
      <span className="eg-meta-txt" aria-hidden="true">{completa ? (hechos > m ? `¡Extra! ${hechos} ${unidad}` : "¡Meta cumplida!") : `Meta: ${m} ${unidad}`}</span>
    </div>
  );
}
