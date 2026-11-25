/**
 * Cofre que se sacude y se abre por frames con rayos de luz. Los frames se piden a src/arte
 * ("cofre/<tipo>-open-fN"); si aún no existen se dibuja un cofre CSS con la misma secuencia.
 */
import { useEffect, useRef, useState } from "react";
import type { CofreAbierto, Rareza } from "../../api";
import { Sprite } from "../../arte";
import { ItemArte } from "./ItemArte";
import { centro, lanzar, menosMovimiento, pausa, sacudir, tocar, vibrar } from "../../efectos";

type Fase = "cerrado" | "sacudiendo" | "abriendo" | "abierto";
const RAREZA: Record<Rareza, string> = { comun: "Común", rara: "Rara", legendaria: "Legendaria" };

interface Props {
  tipo: "normal" | "legendario";
  contenido: CofreAbierto | null;
  onAbrir: () => Promise<void> | void;
}

export function Cofre({ tipo, contenido, onAbrir }: Props) {
  const [fase, setFase] = useState<Fase>(contenido ? "abierto" : "cerrado");
  const [sinArte, setSinArte] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const listo = useRef(false);
  const id = tipo === "legendario" ? "legendario" : "normal";
  const leg = id === "legendario";
  // Frames de apertura (mockups: normal f1–f5, legendario f1–f6).
  const FRAMES = leg ? 6 : 5;
  const [frame, setFrame] = useState(contenido ? FRAMES : 0);

  const abrir = async () => {
    if (fase !== "cerrado") return;
    setFase("sacudiendo");
    tocar("sacudida");
    vibrar("toque");
    const pedido = Promise.resolve(onAbrir());
    await Promise.all([pedido, pausa(700)]);
    listo.current = true;
  };

  // Cuando llega el contenido (y terminó la sacudida) se abre por frames.
  // La fase se lee por ref: si fuera dependencia, el propio setFase("abriendo") cancelaría la animación.
  const faseRef = useRef(fase);
  faseRef.current = fase;
  useEffect(() => {
    if (!contenido || faseRef.current === "abierto" || faseRef.current === "abriendo") return;
    let vivo = true;
    (async () => {
      while (vivo && !listo.current && faseRef.current === "sacudiendo") await new Promise((r) => setTimeout(r, 50));
      if (!vivo) return;
      setFase("abriendo");
      tocar(leg ? "cofreLegendario" : "cofre");
      if (menosMovimiento()) { setFrame(FRAMES); setFase("abierto"); return; }
      for (let f = 1; f <= FRAMES && vivo; f++) {
        setFrame(f);
        await new Promise((r) => setTimeout(r, leg ? 160 : 110));
      }
      if (!vivo) return;
      setFase("abierto");
      const c = centro(caja.current);
      vibrar("cofre");
      sacudir(null, leg ? 3 : 2);
      if (c) {
        lanzar({ tipo: "chispa", desde: c, cantidad: leg ? 40 : 24 });
        lanzar({ tipo: "moneda", desde: c, cantidad: leg ? 16 : 10 });
        if (leg) { lanzar({ tipo: "estrella", desde: c, cantidad: 16 }); lanzar({ tipo: "confeti", desde: c, cantidad: 60 }); }
      }
    })();
    return () => { vivo = false; };
  }, [contenido, FRAMES, leg]);

  const nombreFrame = frame === 0 ? `cofre/${id}` : `cofre/${id}-open-f${frame}`;
  return (
    <div className={`jg-cofre jg-cofre-${id} jg-fase-${fase}`}>
      <div className="jg-cofre-escenario" ref={caja}>
        {(fase === "abriendo" || fase === "abierto") && <span className="jg-rayos" aria-hidden="true" />}
        <div className="jg-cofre-arte" onError={() => setSinArte(true)}>
          {sinArte ? (
            <span className="jg-cofre-css" data-frame={frame} role="img" aria-label={fase === "abierto" ? "Cofre abierto" : "Cofre cerrado"}>
              <span className="jg-tapa" /><span className="jg-caja" /><span className="jg-cerradura" />
            </span>
          ) : (
            <Sprite nombre={nombreFrame} escala={4} alt={fase === "abierto" ? "Cofre abierto" : "Cofre cerrado"} />
          )}
        </div>
      </div>
      {fase === "cerrado" && (
        <button type="button" className="boton jg-latido" onClick={abrir}>Abrir cofre</button>
      )}
      {fase === "cerrado" && leg && <p className="jg-cofre-msg jg-cofre-leg-msg">¡Cofre legendario!</p>}
      {fase === "sacudiendo" && <p className="jg-cofre-msg">{leg ? "¡Algo poderoso se mueve dentro…!" : "Algo se mueve dentro…"}</p>}
      {fase === "abierto" && contenido && (
        <div className="jg-cofre-botin" role="status">
          <p className="exito">El cofre tenía +{contenido.monedas} monedas{contenido.items.length ? ` y ${contenido.items.map((i) => i.nombre).join(", ")}` : ""}.</p>
          <ul className="jg-slots">
            {contenido.items.map((it, i) => (
              <li key={i} className={`jg-slot jg-r-${it.rareza}`} style={{ ["--i" as string]: i }}>
                <ItemArte id={it.item_id} />
                <span>{it.nombre}{it.cantidad && it.cantidad > 1 ? ` ×${it.cantidad}` : ""}</span>
                <small>{RAREZA[it.rareza]}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
