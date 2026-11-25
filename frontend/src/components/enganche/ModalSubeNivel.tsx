import { useEffect, useRef } from "react";
import { spriteHeroe } from "../../arte";
import { momentos } from "../../efectos";
import { Personaje } from "../juego/Personaje";
import { nombreTier } from "./tiers";

interface Props {
  /** Tier nuevo (1..6). */
  tier: number;
  tierAnterior?: number;
  /** Tema en el que evolucionó (opcional, para el subtítulo). */
  tema?: string;
  onCerrar: () => void;
}

/** Celebración de evolución de tier: el héroe viejo "se transforma" en el nuevo con rayos y fanfarria. */
export function ModalSubeNivel({ tier, tierAnterior = Math.max(1, tier - 1), tema, onCerrar }: Props) {
  const boton = useRef<HTMLButtonElement>(null);
  const cb = useRef(onCerrar);
  cb.current = onCerrar;
  useEffect(() => {
    momentos.subirNivel();
    boton.current?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cb.current(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  return (
    <div className="eg-modal-fondo" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="eg-modal" role="dialog" aria-modal="true" aria-labelledby="eg-sube-tit" aria-describedby="eg-sube-desc">
        <span className="eg-rayos" aria-hidden="true" />
        <p className="eg-modal-pre">¡Evolución!</p>
        <h2 id="eg-sube-tit">¡Ahora eres {nombreTier(tier)}!</h2>
        <div className="eg-evolucion" aria-hidden="true">
          <span className="eg-evo-viejo"><Personaje nombre={spriteHeroe(tierAnterior)} rol="heroe" escala={2} alt="" /></span>
          <span className="eg-evo-flecha">▶</span>
          <span className="eg-evo-nuevo"><Personaje nombre={spriteHeroe(tier)} rol="heroe" escala={3} alt="" /></span>
        </div>
        <p id="eg-sube-desc">
          Subiste al tier {tier}{tema ? ` en ${tema}` : ""}: tu atuendo cambió. Lo que aprendiste se nota.
        </p>
        <button ref={boton} type="button" className="boton eg-modal-boton" onClick={onCerrar}>¡Genial! ▶</button>
      </div>
    </div>
  );
}
