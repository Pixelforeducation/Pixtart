/** Piezas del HUD del nivel: progreso, combo y botón de sonido. */
import { forwardRef } from "react";
import { nivelCombo, useSonidoActivo } from "../../efectos";

export { nivelCombo };

export type Marca = "bien" | "mal" | null;

/** Barra segmentada: un bloque por pregunta; el actual brilla. */
export function Progreso({ marcas, actual }: { marcas: Marca[]; actual: number }) {
  const hechas = marcas.filter(Boolean).length;
  return (
    <div className="jg-progreso" role="progressbar" aria-label="Progreso del nivel" aria-valuemin={0} aria-valuemax={marcas.length} aria-valuenow={hechas}
      aria-valuetext={`Pregunta ${actual + 1} de ${marcas.length}`}>
      {marcas.map((m, i) => (
        <span key={i} className={`jg-seg ${m ? `jg-seg-${m}` : ""} ${i === actual && !m ? "jg-seg-actual" : ""}`} />
      ))}
    </div>
  );
}

export function Combo({ racha }: { racha: number }) {
  if (racha < 2) return null;
  const nv = nivelCombo(racha);
  return (
    <div className={`jg-combo jg-combo-${nv}`} key={racha} aria-label={`Racha de ${racha} aciertos seguidos`} role="img">
      <span className="jg-llama" aria-hidden="true" />
      <span className="jg-combo-num" aria-hidden="true">{racha}</span>
      {nv > 1 && <span className="jg-combo-mult" aria-hidden="true">×{nv}</span>}
    </div>
  );
}

export const ContadorXp = forwardRef<HTMLSpanElement, { valor: number; golpe: number }>(function ContadorXp({ valor, golpe }, ref) {
  return (
    <span className="jg-xp" ref={ref} aria-label={`XP ganada en el nivel: ${valor}`} role="img">
      <span className="jg-estrella" aria-hidden="true" />
      <span className="jg-xp-num" key={golpe} aria-hidden="true">+{valor}</span>
    </span>
  );
});

export function BotonSonido() {
  const [activo, alternar] = useSonidoActivo();
  return (
    <button type="button" className="jg-sonido" aria-pressed={!activo} onClick={alternar}
      aria-label={activo ? "Silenciar sonidos" : "Activar sonidos"} title={activo ? "Silenciar" : "Activar sonido"}>
      <span className={`jg-bocina ${activo ? "" : "jg-muda"}`} aria-hidden="true" />
    </button>
  );
}
