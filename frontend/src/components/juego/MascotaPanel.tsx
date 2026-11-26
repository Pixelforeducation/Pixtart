/** Tira de la mascota bajo la escena: comida, ayudas (tecla H) y la cuenta regresiva si está muerta. */
import { useEffect, useRef, useState } from "react";
import type { EstadoMascota } from "../../api";
import { Comida } from "../Iconos";
import { formatoTiempo } from "../Temporizador";

const NOMBRES: Record<string, string> = { "crystal-owl": "Búho de cristal", "ember-fox": "Zorro de brasas", "mini-golem": "Mini gólem" };
export const nombreMascota = (e: string) => NOMBRES[e] ?? e.replace(/[-_]/g, " ");

interface Props {
  mascota: EstadoMascota | null;
  onAyuda?: () => void;
  ayudaPosible: boolean;
  onRevive?: () => void;
  /** Mensaje corto tras pedir ayuda sin éxito (p. ej. "tiene hambre"). */
  aviso?: string | null;
}

const ETAPAS = ["", "Cría", "Evolucionada", "Forma final"];
const UMBRALES = [0, 0, 60, 200];

/** Barra de XP de evolución de la mascota (v0.3). No se pinta si el backend no manda `xp`. */
export function BarraMascota({ mascota }: { mascota: EstadoMascota }) {
  if (mascota.xp === undefined) return null;
  const etapa = mascota.etapa ?? 1;
  const sig = mascota.xp_siguiente ?? null;
  const desde = UMBRALES[etapa] ?? 0;
  const frac = sig === null ? 1 : Math.max(0, Math.min(1, (mascota.xp - desde) / Math.max(1, sig - desde)));
  const texto = sig === null ? `${mascota.xp} XP · forma final` : `${mascota.xp}/${sig} XP`;
  return (
    <div className="jg-mp-evo" role="meter" aria-label={`Evolución de la mascota: etapa ${etapa} (${ETAPAS[etapa]}), ${texto}`}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}>
      <span className="jg-mp-etapa" aria-hidden="true">E{etapa}</span>
      <span className="jg-mp-barra" aria-hidden="true"><span style={{ width: `${frac * 100}%` }} /></span>
      <span className="jg-mp-xp" aria-hidden="true">{texto}</span>
      {(mascota.racha_sin_ayuda ?? 0) >= 2 && <span className="jg-mp-racha" aria-hidden="true">racha {mascota.racha_sin_ayuda}</span>}
    </div>
  );
}

export function MascotaPanel({ mascota, onAyuda, ayudaPosible, onRevive, aviso }: Props) {
  const reviveMs = mascota && !mascota.viva && mascota.revive_en ? Date.parse(mascota.revive_en) : null;
  const [restante, setRestante] = useState(() => (reviveMs ? Math.max(0, reviveMs - Date.now()) : 0));
  const avisado = useRef(false);
  const cb = useRef(onRevive);
  cb.current = onRevive;

  useEffect(() => {
    avisado.current = false;
    if (!reviveMs) return;
    const tick = () => {
      const r = Math.max(0, reviveMs - Date.now());
      setRestante(r);
      if (r === 0 && !avisado.current) { avisado.current = true; cb.current?.(); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [reviveMs]);

  if (!mascota) return <div className="jg-mascota-panel"><span>Sin mascota equipada: juegas en solitario.</span></div>;
  const nombre = nombreMascota(mascota.especie);

  if (!mascota.viva) {
    return (
      <div className="jg-mascota-panel jg-mp-muerta" data-testid="mascota">
        <div>
          <div className="jg-mp-nombre">{nombre} descansa</div>
          <div className="jg-mp-sub">Puedes seguir jugando sin su ayuda.</div>
        </div>
        <div className="jg-mp-reloj" role="timer" aria-label={`Revive en ${formatoTiempo(restante / 1000)}`}>
          Revive en <strong>{formatoTiempo(restante / 1000)}</strong>
        </div>
      </div>
    );
  }

  const quedan = mascota.ayudas_restantes_nivel;
  const puede = quedan > 0 && ayudaPosible;
  return (
    <div className={`jg-mascota-panel ${mascota.hambrienta ? "jg-mp-hambre" : ""}`} data-testid="mascota">
      <div>
        <div className="jg-mp-nombre">{nombre}</div>
        <div className="jg-mp-sub">
          <Comida tam={14} /> {mascota.comida} comida{mascota.hambrienta ? " · ¡tiene hambre!" : ""}
        </div>
        <BarraMascota mascota={mascota} />
        {aviso && <div className="jg-mp-aviso" role="status">{aviso}</div>}
      </div>
      {onAyuda && (
        <button type="button" className="jg-boton-ayuda" onClick={onAyuda} disabled={!puede} aria-keyshortcuts="H"
          aria-label={`Ayuda de ${nombre} (${quedan} restantes)`}
          title={!ayudaPosible ? "Tu mascota no puede ayudar en este tipo de pregunta" : "Tecla H"}>
          <span className="jg-pata" aria-hidden="true" /> Ayuda
          <span className="jg-insignia" aria-hidden="true">{quedan}</span>
          <kbd aria-hidden="true">H</kbd>
        </button>
      )}
    </div>
  );
}
