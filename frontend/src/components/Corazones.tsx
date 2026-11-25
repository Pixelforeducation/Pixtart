import { useEffect, useRef, useState } from "react";
import { Corazon } from "./Iconos";

/** Vidas. Si bajan, el corazón perdido se rompe en dos mitades; si suben, el nuevo late. */
export function Corazones({ vidas, max = 10 }: { vidas: number; max?: number }) {
  const prev = useRef(vidas);
  const [rotos, setRotos] = useState<number[]>([]);
  const [nuevos, setNuevos] = useState<number[]>([]);

  useEffect(() => {
    const antes = prev.current;
    prev.current = vidas;
    if (vidas === antes) return;
    const rango = (a: number, b: number) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);
    if (vidas < antes) setRotos(rango(vidas, antes));
    else setNuevos(rango(antes, vidas));
    const id = setTimeout(() => { setRotos([]); setNuevos([]); }, 1100);
    return () => clearTimeout(id);
  }, [vidas]);

  return (
    <span className={`corazones jg-corazones ${vidas > 0 && vidas <= 3 ? "jg-pocas" : ""}`} role="img" aria-label={`Vidas: ${vidas} de ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`jg-corazon ${rotos.includes(i) ? "jg-roto" : ""} ${nuevos.includes(i) ? "jg-nuevo" : ""}`}>
          <Corazon lleno={i < vidas} />
          {rotos.includes(i) && (
            <>
              <span className="jg-mitad jg-mitad-izq"><Corazon lleno /></span>
              <span className="jg-mitad jg-mitad-der"><Corazon lleno /></span>
            </>
          )}
        </span>
      ))}
    </span>
  );
}
