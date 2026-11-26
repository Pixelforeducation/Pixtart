/**
 * Piezas visuales que usan las pantallas del marco (Inicio, Perfil, Tienda…).
 * Todas piden el sprite al contrato de arte y caen a un respaldo con el arte actual.
 */
import type { Equipo, EtapaMascota } from "../api";
import { existeSprite, spriteIcono, spriteItem, spriteMascota } from "../arte";
import { Candado, Corazon, Engrane, IconoNav, Moneda } from "../components/Iconos";
import { ItemIcono } from "../components/ItemIcono";
import { esEquipable, HeroeEquipado } from "../components/juego/HeroeEquipado";
import "../components/juego/heroe.css";
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

/**
 * Héroe del jugador: sprite del tier + cosméticos de evolución (bandana, pelo, hombreras, casco,
 * capa/corona) y, si se pasa `equipo`, su ropa, armadura y arma.
 */
export function HeroeVisual({ tier, alt, className, anim = "idle", equipo, escala }: {
  tier: number; alt: string; className?: string; anim?: "idle" | "feliz" | "caminar"; equipo?: Equipo | null; escala?: number;
}) {
  return <HeroeEquipado tier={tier} equipo={equipo} anim={anim} alt={alt} className={className} escala={escala} />;
}

/** Corona 7×5 y destello 3×3 para la forma final de la mascota. */
const CORONA_MASCOTA = ["a.a.a.a", "abababa", "aaaaaaa", "acacaca", "aaaaaaa"];
const COL_CORONA: Record<string, string> = { a: "#F2C230", b: "#FFF1A0", c: "#E04848" };
function Pix({ filas, col, className }: { filas: string[]; col: Record<string, string>; className: string }) {
  return (
    <svg className={`pix ${className}`} viewBox={`0 0 ${filas[0].length} ${filas.length}`} shapeRendering="crispEdges" aria-hidden="true">
      {filas.flatMap((f, y) => [...f].map((ch, x) => (col[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={col[ch]} /> : null)))}
    </svg>
  );
}
const ESTRELLA = [".a.", "aba", ".a."];
const COL_ESTRELLA: Record<string, string> = { a: "#FFE27A", b: "#FFFFFF" };

/**
 * Envuelve el dibujo de una mascota con su etapa de evolución: 2 = aura azul y color más intenso;
 * 3 = más grande, aura dorada, corona y destellos. En la etapa 1 no añade nada.
 */
export function EvolucionMascota({ etapa, children }: { etapa?: EtapaMascota | number | null; children: JSX.Element }) {
  const e = etapa === 2 || etapa === 3 ? etapa : 1;
  if (e === 1) return children;
  return (
    <span className={`mascota-evo etapa-${e}`} data-etapa={e}>
      {children}
      {e === 3 && (
        <>
          <Pix filas={CORONA_MASCOTA} col={COL_CORONA} className="mascota-corona" />
          <Pix filas={ESTRELLA} col={COL_ESTRELLA} className="mascota-estrella e1" />
          <Pix filas={ESTRELLA} col={COL_ESTRELLA} className="mascota-estrella e2" />
        </>
      )}
    </span>
  );
}

export function MascotaVisual({ especie, alt, className, etapa }: { especie: string; alt: string; className?: string; etapa?: EtapaMascota }) {
  return (
    <EvolucionMascota etapa={etapa}>
      <SpriteSeguro nombre={spriteMascota(especie)} alt={alt} className={className}
        respaldo={<SpriteViejo src={srcMascota(especie)} alt={alt} className={className} />} />
    </EvolucionMascota>
  );
}

export function CofreVisual({ tipo = "normal", alt = "", className }: { tipo?: "normal" | "legendario"; alt?: string; className?: string }) {
  const viejo = tipo === "legendario" ? "/sprites/chest-legendary.svg" : "/sprites/chest-normal.svg";
  return <SpriteSeguro nombre={`cofre/${tipo}`} alt={alt} className={className} respaldo={<SpriteViejo src={viejo} alt={alt} className={className} />} />;
}

export function ItemVisual({ id }: { id: string }) {
  // Armas, armaduras y ropa se dibujan inline (mismas capas que el héroe); también lo desconocido.
  if (esEquipable(id) || !existeSprite(spriteItem(id))) return <ItemIcono id={id} />;
  return <SpriteSeguro nombre={spriteItem(id)} alt="" escala={2} respaldo={<ItemIcono id={id} />} />;
}

export function AnfitrionVisual({ id = "owl-librarian", alt, className }: { id?: string; alt: string; className?: string }) {
  return <SpriteSeguro nombre={`anfitrion/${id}`} anim="hablar" alt={alt} className={className}
    respaldo={<SpriteSeguro nombre={`anfitrion/${id}`} alt={alt} className={className}
      respaldo={<SpriteViejo src="/sprites/mage.svg" alt={alt} className={className} />} />} />;
}
