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
}

/** Cuenta regresiva por pregunta. Llama `onAgotado` una sola vez al llegar a 0. */
export function Temporizador({ segundos, activo = true, onAgotado, clave }: Props) {
  const [restante, setRestante] = useState(segundos);
  const restanteRef = useRef(segundos);
  const agotado = useRef(false);
  const cb = useRef(onAgotado);
  cb.current = onAgotado;

  useEffect(() => {
    restanteRef.current = segundos;
    setRestante(segundos);
    agotado.current = false;
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
    if (activo && restante === 0 && !agotado.current) {
      agotado.current = true;
      cb.current();
    }
  }, [activo, restante]);

  const urgente = restante <= 10;
  return (
    <div className={`temporizador hud-texto ${urgente ? "urgente" : ""}`} role="timer" aria-label={`Tiempo restante ${formatoTiempo(restante)}`}>
      <span aria-hidden="true">⏱ {formatoTiempo(restante)}</span>
      {urgente && restante > 0 && <span className="sr-only" aria-live="assertive">Quedan menos de 10 segundos</span>}
    </div>
  );
}
