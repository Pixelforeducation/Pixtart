/** Selector de intensidad de animación (Ajustes). Afecta fondos, pulsos y contadores. */
import { guardarNivelAnimacion, useNivelAnimacion, type NivelAnimacion } from "./index";

const OPCIONES: { v: NivelAnimacion; txt: string; ayuda: string }[] = [
  { v: "completa", txt: "Completas", ayuda: "Viento, partículas y parallax." },
  { v: "suave", txt: "Suaves", ayuda: "Menos movimiento y partículas." },
  { v: "apagada", txt: "Apagadas", ayuda: "Todo quieto." },
];

export function AjusteAnimaciones() {
  const nivel = useNivelAnimacion();
  return (
    <section className="panel" aria-labelledby="h-anim">
      <h2 id="h-anim" style={{ marginTop: 0 }}>Animaciones</h2>
      <fieldset>
        <legend>Movimiento del mundo</legend>
        {OPCIONES.map((o) => (
          <label key={o.v} className="casilla">
            <input type="radio" name="animaciones" value={o.v} checked={nivel === o.v} onChange={() => guardarNivelAnimacion(o.v)} />
            <span><strong>{o.txt}</strong> · {o.ayuda}</span>
          </label>
        ))}
      </fieldset>
      <p className="ayuda-campo">Si tu sistema pide reducir movimiento, siempre se respeta.</p>
    </section>
  );
}
