/**
 * Sonido, música, volumen y vibración (Ajustes). Efectos: motor de `src/efectos`; música: `escenas/musica`.
 * Todo se guarda en el dispositivo. Apagar los efectos de sonido calla también la música (silencio global).
 */
import { useState } from "react";
import { ponerVibracion, tocar, vibracionActiva, vibrar } from "../efectos";
import { useSonido } from "../efectos/sonido";
import { useMusica } from "../escenas/musica";

export function AjusteSonido() {
  const s = useSonido();
  const m = useMusica();
  const [vib, setVib] = useState(vibracionActiva);
  return (
    <section className="panel" aria-labelledby="h-sonido">
      <h2 id="h-sonido" style={{ marginTop: 0 }}>Sonido, música y vibración</h2>
      <label className="casilla">
        <input type="checkbox" checked={s.activo} onChange={() => { s.alternar(); if (!s.activo) tocar("acierto", 3); }} />
        <span><strong>Efectos de sonido</strong> · aciertos, monedas, cofres</span>
      </label>
      <label className="campo">
        <span>Volumen de los efectos</span>
        <input type="range" min={0} max={100} step={5} value={Math.round(s.volumen * 100)} disabled={!s.activo}
          aria-valuetext={`${Math.round(s.volumen * 100)} %`}
          onChange={(e) => s.ponerVolumen(Number(e.target.value) / 100)}
          onPointerUp={() => tocar("moneda")} />
      </label>
      <label className="casilla">
        <input type="checkbox" checked={m.activa} onChange={() => m.setActiva(!m.activa)} />
        <span><strong>Música de fondo</strong> · chiptune en el mapa, los niveles y el jefe{s.activo ? "" : " (silenciada con los efectos)"}</span>
      </label>
      <label className="campo">
        <span>Volumen de la música</span>
        <input type="range" min={0} max={100} step={5} value={Math.round(m.volumen * 100)} disabled={!m.activa}
          aria-valuetext={`${Math.round(m.volumen * 100)} %`}
          onChange={(e) => m.setVolumen(Number(e.target.value) / 100)} />
      </label>
      <label className="casilla">
        <input type="checkbox" checked={vib} onChange={() => { const v = !vib; ponerVibracion(v); setVib(v); if (v) vibrar("acierto"); }} />
        <span><strong>Vibración</strong> · solo en teléfonos que la permiten</span>
      </label>
    </section>
  );
}
