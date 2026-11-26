import { useEffect, useRef, useState } from "react";

export function formatoTiempo(s: number): string {
  const t = Math.max(0, Math.ceil(s));
  const m = Math.floor(t / 60);
  return `${m}:${String(t % 60).padStart(2, "0")}`;
}

interface Props {
  segundos: number;
  /** Si es false el reloj se congela (p. ej. mientras se muestra el feedback). */
  activo?: boolean;
  onAgotado: () => void;
  /** Cambia para reiniciar el reloj (p. ej. el id de la pregunta). */
  clave?: unknown;
  /** Se llama una vez por segundo entero en los últimos `nervioso` segundos (para el tic-tac). */
  onSegundo?: (restante: number) => void;
  /** Segundos finales en que el reloj "se pone nervioso" (tiembla y hace tic). */
  nervioso?: number;
  /** Duración total de la pregunta (para la barra) cuando `segundos` es lo que queda, p. ej. al retomar. */
  total?: number;
}

/** Cuenta regresiva por pregunta con reloj de arena y barra. Llama `onAgotado` una sola vez al llegar a 0. */
export function Temporizador({ segundos, activo = true, onAgotado, clave, onSegundo, nervioso = 5, total }: Props) {
  const [restante, setRestante] = useState(segundos);
  const restanteRef = useRef(segundos);
  const agotado = useRef(false);
  const cb = useRef(onAgotado);
  cb.current = onAgotado;
  const cbSeg = useRef(onSegundo);
  cbSeg.current = onSegundo;
  const ultimoSeg = useRef<number | null>(null);

  useEffect(() => {
    restanteRef.current = segundos;
    setRestante(segundos);
    agotado.current = false;
    ultimoSeg.current = null;
  }, [segundos, clave]);

  useEffect(() => {
    if (!activo) return;
    const fin = Date.now() + restanteRef.current * 1000;
    const id = setInterval(() => {
      const n = Math.max(0, (fin - Date.now()) / 1000);
      restanteRef.current = n;
      setRestante(n);
      if (n === 0) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [activo, clave, segundos]);

  useEffect(() => {
    // Se mira la ref (que se reinicia al cambiar de pregunta) y no solo el estado: tras agotarse una
    // pregunta el estado sigue en 0 durante el primer render de la siguiente y la daría por perdida.
    if (activo && restante === 0 && restanteRef.current === 0 && !agotado.current) {
      agotado.current = true;
      cb.current();
    }
  }, [activo, restante]);

  const entero = Math.ceil(restante);
  useEffect(() => {
    if (!activo || entero <= 0 || entero > nervioso || ultimoSeg.current === entero) return;
    ultimoSeg.current = entero;
    cbSeg.current?.(entero);
  }, [activo, entero, nervioso]);

  const urgente = restante <= 10;
  const tiembla = activo && restante > 0 && restante <= nervioso;
  const base = Math.max(segundos, total ?? 0);
  const frac = base > 0 ? Math.max(0, Math.min(1, restante / base)) : 0;
  const tono = frac > 0.5 && !urgente ? "verde" : frac > 0.25 && !urgente ? "ambar" : "rojo";
  return (
    <div className={`temporizador jg-reloj jg-reloj-${tono} ${urgente ? "urgente" : ""} ${tiembla ? "nervioso" : ""}`} role="timer"
      aria-label={`Tiempo restante ${formatoTiempo(restante)}`}>
      <span className="jg-arena" aria-hidden="true" />
      <span className="jg-reloj-barra" aria-hidden="true"><span style={{ width: `${frac * 100}%` }} /></span>
      <span className="jg-reloj-txt" aria-hidden="true">{formatoTiempo(restante)}</span>
      {urgente && restante > 0 && <span className="sr-only" aria-live="assertive">Quedan menos de 10 segundos</span>}
    </div>
  );
}
