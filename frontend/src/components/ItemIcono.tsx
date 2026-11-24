import { Comida, Escudo, Pocion } from "./Iconos";
import { nombreEspecie, Sprite, srcItem } from "./Sprite";

const NOMBRES: Record<string, string> = {
  botiquin: "Botiquín",
  pocion_resurreccion: "Poción de resurrección",
  comida: "Comida de mascota",
  escudo: "Escudo de color",
  lupa: "Lupa",
};
export const nombreItem = (id: string) =>
  NOMBRES[id] ?? (id.startsWith("mascota_") ? `Mascota: ${nombreEspecie(id.slice(8))}` : id.replace(/_/g, " "));

export function ItemIcono({ id }: { id: string }) {
  if (id === "comida") return <Comida tam={64} />;
  if (id === "escudo") return <Escudo tam={64} />;
  if (id === "pocion_resurreccion") return <Pocion tam={64} />;
  const src = srcItem(id);
  return src ? <Sprite src={src} alt="" /> : <Pocion tam={64} />;
}
