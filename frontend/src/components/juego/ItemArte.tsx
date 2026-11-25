/** Ítem con el arte de src/arte; si el sprite aún no existe, cae al ícono local (nunca imagen rota). */
import { useState } from "react";
import { Sprite, spriteItem } from "../../arte";
import { ItemIcono } from "../ItemIcono";

export function ItemArte({ id, escala = 2 }: { id: string; escala?: number }) {
  const [fallo, setFallo] = useState(false);
  return (
    <span className="jg-item-arte" onError={() => setFallo(true)} style={{ width: 32 * escala, height: 32 * escala }}>
      {fallo ? <ItemIcono id={id} /> : <Sprite nombre={spriteItem(id)} escala={escala} alt="" />}
    </span>
  );
}
