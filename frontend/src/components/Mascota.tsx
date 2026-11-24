import { useEffect, useRef, useState } from "react";
import type { EstadoMascota } from "../api";
import { Comida } from "./Iconos";
import { nombreEspecie, Sprite, srcMascota } from "./Sprite";
import { formatoTiempo } from "./Temporizador";

const RAREZA = { comun: "común", rara: "rara", legendaria: "legendaria" } as const;

interface Props {
  mascota: EstadoMascota | null;
  /** Si se pasa, muestra el botón de ayuda. */
  onAyuda?: () => void;
  ayudaPosible?: boolean;
  /** Se llama cuando la cuenta regresiva de resurrección llega a 0. */
  onRevive?: () => void;
  ahora?: () => number;
}

export function Mascota({ mascota, onAyuda, ayudaPosible = true, onRevive, ahora = Date.now }: Props) {
  const reviveMs = mascota && !mascota.viva && mascota.revive_en ? Date.parse(mascota.revive_en) : null;
  const [restante, setRestante] = useState(() => (reviveMs ? Math.max(0, reviveMs - ahora()) : 0));
  const avisado = useRef(false);
  const cbRevive = useRef(onRevive);
  cbRevive.current = onRevive;

  useEffect(() => {
    avisado.current = false;
    if (!reviveMs) return;
    const tick = () => {
      const r = Math.max(0, reviveMs - ahora());
      setRestante(r);
      if (r === 0 && !avisado.current) {
        avisado.current = true;
        cbRevive.current?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [reviveMs, ahora]);

  if (!mascota) return <div className="mascota"><span>Sin mascota equipada</span></div>;
  const nombre = nombreEspecie(mascota.especie);

  if (!mascota.viva) {
    return (
      <div className="mascota muerta" data-testid="mascota">
        <Sprite src={srcMascota(mascota.especie)} alt={`${nombre} (descansando)`} />
        <div>
          <div className="pix-font" style={{ fontSize: 9 }}>{nombre} descansa</div>
          <div role="timer" aria-label={`Revive en ${formatoTiempo(restante / 1000)}`}>
            Revive en <strong>{formatoTiempo(restante / 1000)}</strong>
          </div>
          <div style={{ fontSize: 16 }}>Puedes seguir jugando sin mascota.</div>
        </div>
      </div>
    );
  }

  const quedan = mascota.ayudas_restantes_nivel;
  return (
    <div className="mascota" data-testid="mascota">
      <Sprite src={srcMascota(mascota.especie)} alt={`${nombre}, mascota ${RAREZA[mascota.rareza]}`} />
      <div>
        <div className="pix-font" style={{ fontSize: 9 }}>{nombre}</div>
        <div className="fila" style={{ fontSize: 16, gap: 4 }}>
          <Comida /> <span>{mascota.comida} comida{mascota.hambrienta ? " · ¡hambrienta!" : ""}</span>
        </div>
        {onAyuda && (
          <button type="button" className="boton chico" onClick={onAyuda} disabled={quedan <= 0 || !ayudaPosible}
            title={!ayudaPosible ? "Tu mascota no puede ayudar en este tipo de pregunta" : undefined}>
            Ayuda ({quedan})
          </button>
        )}
      </div>
    </div>
  );
}
