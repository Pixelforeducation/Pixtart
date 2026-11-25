/** Sonido, volumen y vibración (Ajustes). Usa el motor de `src/efectos`, que guarda todo en el dispositivo. */
import { useState } from "react";
import { ponerVibracion, tocar, vibracionActiva, vibrar } from "../efectos";
import { useSonido } from "../efectos/sonido";

export function AjusteSonido() {
  const s = useSonido();
  const [vib, setVib] = useState(vibracionActiva);
  return (
    <section className="panel" aria-labelledby="h-sonido">
      <h2 id="h-sonido" style={{ marginTop: 0 }}>Sonido y vibración</h2>
      <label className="casilla">
        <input type="checkbox" checked={s.activo} onChange={() => { s.alternar(); if (!s.activo) tocar("acierto", 3); }} />
        <span><strong>Efectos de sonido</strong> · aciertos, monedas, cofres</span>
      </label>
      <label className="campo">
        <span>Volumen</span>
        <input type="range" min={0} max={100} step={5} value={Math.round(s.volumen * 100)} disabled={!s.activo}
          aria-valuetext={`${Math.round(s.volumen * 100)} %`}
          onChange={(e) => s.ponerVolumen(Number(e.target.value) / 100)}
          onPointerUp={() => tocar("moneda")} />
      </label>
      <label className="casilla">
        <input type="checkbox" checked={vib} onChange={() => { const v = !vib; ponerVibracion(v); setVib(v); if (v) vibrar("acierto"); }} />
        <span><strong>Vibración</strong> · solo en teléfonos que la permiten</span>
      </label>
    </section>
  );
}
