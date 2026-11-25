/**
 * Piezas visuales que usan las pantallas del marco (Inicio, Perfil, Tienda…).
 * Todas piden el sprite al contrato de arte y caen a un respaldo con el arte actual.
 */
import { spriteHeroe, spriteIcono, spriteItem, spriteMascota } from "../arte";
import { Candado, Corazon, Engrane, IconoNav, Moneda } from "../components/Iconos";
import { ItemIcono } from "../components/ItemIcono";
import { Sprite as SpriteViejo, srcMascota } from "../components/Sprite";
import { SpriteSeguro } from "./SpriteSeguro";

/** Rayo de racha 7×9 (respaldo hasta que exista icono/racha). */
function Rayo({ tam = 24 }: { tam?: number }) {
  const filas = ["...aaa.", "..abba.", "..aba..", ".abbaaa", "abbbbba", "aaabba.", "..aba..", "..aa...", ".a....."];
  const col: Record<string, string> = { a: "#8A4A0E", b: "#FFD23F" };
  return (
    <svg className="pix" viewBox="0 0 7 9" width={tam} height={tam} shapeRendering="crispEdges" aria-hidden="true">
      {filas.flatMap((f, y) => [...f].map((ch, x) => (col[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={col[ch]} /> : null)))}
    </svg>
  );
}

const RESPALDO_ICONO: Record<string, (tam: number) => JSX.Element> = {
  inicio: () => <IconoNav nombre="inicio" />,
  arena: () => <IconoNav nombre="arena" />,
  taller: () => <IconoNav nombre="taller" />,
  tienda: () => <IconoNav nombre="tienda" />,
  perfil: () => <IconoNav nombre="perfil" />,
  moneda: (t) => <Moneda tam={t} />,
  corazon: (t) => <Corazon tam={t} />,
  racha: (t) => <Rayo tam={t} />,
  ajustes: (t) => <Engrane tam={t} />,
  candado: (t) => <Candado tam={t} />,
};

export function IconoUI({ id, tam = 24 }: { id: string; tam?: number }) {
  const respaldo = RESPALDO_ICONO[id]?.(tam) ?? <Moneda tam={tam} />;
  return <SpriteSeguro nombre={spriteIcono(id)} alt="" escala={Math.max(1, Math.round(tam / 32))} style={{ width: tam, height: tam }} respaldo={respaldo} />;
}

export function HeroeVisual({ tier, alt, className, anim = "idle" }: { tier: number; alt: string; className?: string; anim?: "idle" | "feliz" | "caminar" }) {
  return (
    <SpriteSeguro nombre={spriteHeroe(tier)} anim={anim} alt={alt} className={className}
      respaldo={<SpriteViejo src="/sprites/ogre-green.svg" alt={alt} className={className} />} />
  );
}

export function MascotaVisual({ especie, alt, className }: { especie: string; alt: string; className?: string }) {
  return (
    <SpriteSeguro nombre={spriteMascota(especie)} alt={alt} className={className}
      respaldo={<SpriteViejo src={srcMascota(especie)} alt={alt} className={className} />} />
  );
}

export function CofreVisual({ tipo = "normal", alt = "", className }: { tipo?: "normal" | "legendario"; alt?: string; className?: string }) {
  const viejo = tipo === "legendario" ? "/sprites/chest-legendary.svg" : "/sprites/chest-normal.svg";
  return <SpriteSeguro nombre={`cofre/${tipo}`} alt={alt} className={className} respaldo={<SpriteViejo src={viejo} alt={alt} className={className} />} />;
}

export function ItemVisual({ id }: { id: string }) {
  return <SpriteSeguro nombre={spriteItem(id)} alt="" escala={2} respaldo={<ItemIcono id={id} />} />;
}

export function AnfitrionVisual({ id = "owl-librarian", alt, className }: { id?: string; alt: string; className?: string }) {
  return <SpriteSeguro nombre={`anfitrion/${id}`} anim="hablar" alt={alt} className={className}
    respaldo={<SpriteSeguro nombre={`anfitrion/${id}`} alt={alt} className={className}
      respaldo={<SpriteViejo src="/sprites/mage.svg" alt={alt} className={className} />} />} />;
}
