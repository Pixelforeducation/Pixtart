import { useEffect, useRef, useState } from "react";
import { tocar, useContador } from "../../efectos";
import { progresoTier } from "./tiers";

interface Props {
  /** XP total del tema (objetivo). */
  xp: number;
  /** XP desde la que arranca la animación (p. ej. la de antes del nivel). Por defecto, `xp` (sin animar). */
  desde?: number;
  /** Retraso antes de empezar a subir (ms). */
  retraso?: number;
  /** Texto pequeño encima (p. ej. el tema). */
  etiqueta?: string;
  /** Se llama UNA vez si durante la subida se cruza a un tier nuevo. */
  onSubeNivel?: (tierNuevo: number, tierAnterior: number) => void;
  compacta?: boolean;
}

/** Barra de experiencia por tier que sube animada (con "tic" de XP y brillo) y avisa al evolucionar. */
export function BarraXP({ xp, desde, retraso = 300, etiqueta, onSubeNivel, compacta = false }: Props) {
  const [objetivo, setObjetivo] = useState(desde ?? xp);
  useEffect(() => {
    const id = setTimeout(() => setObjetivo(xp), retraso);
    return () => clearTimeout(id);
  }, [xp, retraso]);
  const ultimoTic = useRef(0);
  const valor = useContador(objetivo, {
    duracion: Math.min(1600, 400 + Math.abs(xp - (desde ?? xp)) * 6),
    inicial: desde ?? xp,
    alPaso: (v) => { if (v - ultimoTic.current >= 8) { ultimoTic.current = v; tocar("xp", v % 10); } },
  });
  const mostrado = valor;
  const p = progresoTier(mostrado);
  const tierInicial = useRef(progresoTier(desde ?? xp).tier);
  const avisado = useRef(false);
  const cb = useRef(onSubeNivel);
  cb.current = onSubeNivel;
  useEffect(() => {
    if (!avisado.current && p.tier > tierInicial.current) {
      avisado.current = true;
      cb.current?.(p.tier, tierInicial.current);
    }
  }, [p.tier]);

  const subiendo = mostrado < objetivo;
  return (
    <div className={`eg-xp ${compacta ? "eg-xp-compacta" : ""} ${subiendo ? "eg-xp-sube" : ""}`}>
      <div className="eg-xp-cabeza">
        <span className="eg-xp-tier">T{p.tier} · {p.nombre}</span>
        {etiqueta && <span className="eg-xp-etiqueta">{etiqueta}</span>}
        <span className="eg-xp-num" aria-hidden="true">{p.maximo ? `${mostrado} XP` : `${mostrado}/${p.hasta}`}</span>
      </div>
      <div className="eg-xp-barra" role="progressbar" aria-label={`Experiencia, tier ${p.tier} ${p.nombre}`}
        aria-valuemin={p.desde} aria-valuemax={p.maximo ? mostrado : p.hasta} aria-valuenow={mostrado}
        aria-valuetext={p.maximo ? `${mostrado} XP, tier máximo` : `${mostrado} de ${p.hasta} XP para el siguiente tier`}>
        <span className="eg-xp-relleno" style={{ width: `${p.frac * 100}%` }} />
        <span className="eg-xp-marcas" aria-hidden="true" />
      </div>
    </div>
  );
}
