/** Ítem con el arte de src/arte; si el sprite aún no existe, cae al ícono local (nunca imagen rota). */
import { useState } from "react";
import { Sprite, spriteItem } from "../../arte";
import { ItemIcono } from "../ItemIcono";
import { esEquipable } from "./HeroeEquipado";

export function ItemArte({ id, escala = 2 }: { id: string; escala?: number }) {
  const [fallo, setFallo] = useState(false);
  if (esEquipable(id)) return <span className="jg-item-arte" style={{ width: 32 * escala, height: 32 * escala }}><ItemIcono id={id} /></span>;
  return (
    <span className="jg-item-arte" onError={() => setFallo(true)} style={{ width: 32 * escala, height: 32 * escala }}>
      {fallo ? <ItemIcono id={id} /> : <Sprite nombre={spriteItem(id)} escala={escala} alt="" />}
    </span>
  );
}
