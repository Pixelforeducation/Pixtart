/**
 * Muestra un sprite del contrato de arte (`Sprite` de ../arte) y, mientras el archivo no exista
 * (el agente `arte` lo está dibujando en paralelo), un respaldo con el arte que ya hay.
 * Cuando el sprite aparece en /public/sprites, se usa solo: no hay que tocar este código.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Sprite, spriteUrl, type Anim } from "../arte";

const existe = new Map<string, boolean>();
const PRUEBAS = import.meta.env.MODE === "test";

function useExiste(url: string): boolean | null {
  const [ok, setOk] = useState<boolean | null>(() => existe.get(url) ?? null);
  useEffect(() => {
    if (existe.has(url)) { setOk(existe.get(url)!); return; }
    if (PRUEBAS || typeof Image === "undefined") { setOk(false); return; }
    let vivo = true;
    const img = new Image();
    img.onload = () => { existe.set(url, true); if (vivo) setOk(true); };
    img.onerror = () => { existe.set(url, false); if (vivo) setOk(false); };
    img.src = url;
    return () => { vivo = false; };
  }, [url]);
  return ok;
}

interface Props {
  nombre: string;
  anim?: Anim;
  escala?: number;
  alt: string;
  className?: string;
  style?: CSSProperties;
  /** Lo que se ve si el sprite aún no existe. */
  respaldo: ReactNode;
}

export function SpriteSeguro({ nombre, anim = "idle", escala, alt, className, style, respaldo }: Props) {
  const ok = useExiste(spriteUrl(nombre, anim));
  if (ok) return <Sprite nombre={nombre} anim={anim} escala={escala} alt={alt} className={className} style={style} />;
  return <>{respaldo}</>;
}
