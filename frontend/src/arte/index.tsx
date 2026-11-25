/**
 * CONTRATO DE ARTE (dueño: agente `arte`). Los demás agentes solo IMPORTAN de aquí.
 *
 * Nombres de sprite: "<grupo>/<id>" → /sprites/<grupo>/<id>.svg (o frames <id>-<anim>-fN.svg).
 * Grupos: heroe, mascota, anfitrion, enemigo, item, icono, cofre, efecto.
 *
 * Los SVG y `manifiesto.json` los genera `frontend/herramientas/generar_sprites.py` (determinista).
 * Galería en desarrollo: abrir /sprites/galeria.html.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import manifiesto from "./manifiesto.json";

export type Anim =
  | "idle"
  | "feliz"
  | "triste"
  | "herido"
  | "ataque"
  | "caminar"
  | "hablar"
  | "muerta" // mascota muerta (fantasmita) / enemigo derrotado
  | "ayudando" // mascota dando una pista
  | "abrir"; // cofre

export interface SpriteProps {
  nombre: string;
  anim?: Anim;
  escala?: number; // múltiplo entero de 32 px lógicos
  alt: string; // "" si es decorativo
  className?: string;
  style?: CSSProperties;
  /** Fuerza repetir (true) o quedarse en el último frame (false). Por defecto, lo que diga el manifiesto. */
  bucle?: boolean;
  /** Se llama una vez cuando termina una animación sin bucle (p. ej. cofre "abrir"). */
  onFin?: () => void;
  /** Congela el sprite en su primer frame. */
  pausado?: boolean;
}

/** Ficha de personaje para diálogos, catálogos y tooltips. */
export interface FichaPersonaje {
  id: string; // p. ej. "mascota/ember-fox"
  nombre: string;
  rol: "heroe" | "mascota" | "anfitrion" | "enemigo";
  rareza?: "comun" | "rara" | "legendaria";
  descripcion?: string;
  /** Solo mascotas: la `especie` del sprite. */
  especie?: string;
  /** Solo enemigos: es jefe del nivel final. */
  jefe?: boolean;
  /** Skin o variante de otro personaje. */
  variante_de?: string;
  /** Solo héroe: 1..6. */
  tier?: number;
}

export interface InfoAnim {
  frames: number;
  ms: number;
  bucle?: boolean;
}
export interface InfoSprite {
  titulo: string;
  lado: number; // 32 (personajes, cofres, efectos grandes) o 16 (ítems, íconos)
  anims: Partial<Record<Anim, InfoAnim>>;
}

const SPRITES = manifiesto.sprites as unknown as Record<string, InfoSprite>;
const FICHAS = manifiesto.fichas as unknown as FichaPersonaje[];
const FALTA = "efecto/falta";

/**
 * Alias → nombre real. La API ya manda las especies nuevas (backend/app/game/recompensas.py); se
 * conservan alias de las especies anteriores por compatibilidad, más los `item_id` públicos
 * (app/play/ids.py) y nombres en español cómodos para los otros agentes.
 */
export const ALIAS: Record<string, string> = {
  // especies del catálogo ANTERIOR del backend (partidas viejas en caché) → mascotas tiernas
  "mascota/imp-small": "mascota/mushroom-sprout",
  "mascota/skeleton-small": "mascota/windup-robot",
  "mascota/zombie": "mascota/inkwell",
  "mascota/mage": "mascota/mini-golem",
  "mascota/ghost": "mascota/book-golem",
  "mascota/black-knight": "mascota/onyx-dragon",
  // nombres en español
  "mascota/chispa": "mascota/mushroom-sprout",
  "mascota/seti": "mascota/mushroom-sprout",
  "mascota/huesillo": "mascota/windup-robot",
  "mascota/tictac": "mascota/windup-robot",
  "mascota/zuzu": "mascota/inkwell",
  "mascota/borron": "mascota/inkwell",
  "mascota/orlo": "mascota/mini-golem",
  "mascota/musgo": "mascota/mini-golem",
  "mascota/bruma": "mascota/book-golem",
  "mascota/tomo": "mascota/book-golem",
  "mascota/zorro-brasas": "mascota/ember-fox",
  "mascota/zorro_brasas": "mascota/ember-fox",
  "mascota/brasa": "mascota/ember-fox",
  "mascota/buho-cristal": "mascota/crystal-owl",
  "mascota/buho_cristal": "mascota/crystal-owl",
  "mascota/cristal": "mascota/crystal-owl",
  "mascota/onix": "mascota/onyx-dragon",
  "mascota/nox": "mascota/onyx-dragon",
  // ítems con id interno
  "item/comida_mascota": "item/comida",
  "item/escudo_color": "item/escudo",
  "item/monedas": "item/moneda",
  // anfitriones
  "anfitrion/buho": "anfitrion/owl-librarian",
  "anfitrion/buho-maestro": "anfitrion/owl-librarian",
  "anfitrion/mago": "anfitrion/mage",
  "anfitrion/alquimista": "anfitrion/alchemist",
  "anfitrion/astronomo": "anfitrion/astronomer",
  "anfitrion/bardo": "anfitrion/bard",
  "anfitrion/druida": "anfitrion/druid",
  "anfitrion/pirata": "anfitrion/pirate-cartographer",
  // enemigos
  "enemigo/ogro": "enemigo/ogre-green",
  "enemigo/diablillo": "enemigo/imp-small",
  "enemigo/esqueleto": "enemigo/skeleton-small",
  "enemigo/zombi": "enemigo/zombie",
  "enemigo/fantasma": "enemigo/ghost",
  "enemigo/demonio": "enemigo/demon-big",
  "enemigo/onix": "enemigo/black-knight",
  "enemigo/caballero-negro": "enemigo/black-knight",
  // íconos y efectos
  "icono/escudo_color": "icono/escudo",
  "icono/comida_mascota": "icono/comida",
  "icono/pocion_resurreccion": "icono/pocion",
  "efecto/moneda-girando": "efecto/moneda",
  "efecto/mas-xp": "efecto/xp",
};

/** Qué anim usar si el sprite no trae la pedida (todas acaban en "idle" o en el frame estático). */
const RESPALDO: Partial<Record<Anim, Anim>> = {
  herido: "triste",
  triste: "idle",
  muerta: "triste",
  ayudando: "feliz",
  feliz: "idle",
  hablar: "idle",
  ataque: "idle",
  caminar: "idle",
  abrir: "idle",
};

/** Nombre real del sprite (resuelve alias); "efecto/falta" si no existe. */
export function resolverSprite(nombre: string): string {
  const n = ALIAS[nombre] ?? nombre;
  return n in SPRITES ? n : FALTA;
}

export function existeSprite(nombre: string): boolean {
  return (ALIAS[nombre] ?? nombre) in SPRITES;
}

export function infoSprite(nombre: string): InfoSprite {
  return SPRITES[resolverSprite(nombre)];
}

/** La anim que de verdad se mostrará (siguiendo los respaldos), o null si solo hay frame estático. */
export function animDisponible(nombre: string, anim: Anim): Anim | null {
  const { anims } = infoSprite(nombre);
  let a: Anim | undefined = anim;
  for (let i = 0; a && i < 6; i++) {
    if (anims[a]) return a;
    a = RESPALDO[a];
  }
  return null;
}

const BASE = `${import.meta.env.BASE_URL ?? "/"}sprites/`;

/** URL de un frame (1..N). Sin anim disponible devuelve el SVG estático `<grupo>/<id>.svg`. */
export function spriteUrl(nombre: string, anim: Anim = "idle", frame = 1): string {
  const n = resolverSprite(nombre);
  const a = animDisponible(n, anim);
  if (!a) return `${BASE}${n}.svg`;
  const total = SPRITES[n].anims[a]!.frames;
  const f = Math.min(Math.max(1, Math.floor(frame)), total);
  return `${BASE}${n}-${a}-f${f}.svg`;
}

/** Todas las URLs de una animación (para precargar o para Phaser). */
export function framesDe(nombre: string, anim: Anim = "idle"): { urls: string[]; ms: number; bucle: boolean } {
  const n = resolverSprite(nombre);
  const a = animDisponible(n, anim);
  if (!a) return { urls: [`${BASE}${n}.svg`], ms: 0, bucle: false };
  const info = SPRITES[n].anims[a]!;
  return {
    urls: Array.from({ length: info.frames }, (_, i) => `${BASE}${n}-${a}-f${i + 1}.svg`),
    ms: info.ms,
    bucle: info.bucle ?? true,
  };
}

function prefiereMenosMovimiento(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useMenosMovimiento(): boolean {
  const [reducir, setReducir] = useState(prefiereMenosMovimiento);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cambia = () => setReducir(mq.matches);
    mq.addEventListener?.("change", cambia);
    return () => mq.removeEventListener?.("change", cambia);
  }, []);
  return reducir;
}

/**
 * Sprite pixel-art animado. Cambia de frame con un intervalo (los SVG son archivos sueltos).
 * Con `prefers-reduced-motion` muestra un solo frame: el primero, o el último si la anim no se repite
 * (así un cofre "abrir" se ve abierto) y llama a `onFin` de inmediato.
 */
export function Sprite({ nombre, anim = "idle", escala = 3, alt, className, style, bucle, onFin, pausado }: SpriteProps) {
  const reducir = useMenosMovimiento();
  const { urls, ms, bucle: bucleM } = useMemo(() => framesDe(nombre, anim), [nombre, anim]);
  const repite = bucle ?? bucleM;
  const quieto = Boolean(pausado) || reducir || urls.length < 2;
  const [frame, setFrame] = useState(0);

  // onFin no está en las dependencias a propósito: cambiarlo no debe reiniciar la animación.
  useEffect(() => {
    setFrame(quieto && !repite && !pausado ? urls.length - 1 : 0);
    if (quieto) {
      if (!repite && !pausado) onFin?.();
      return;
    }
    for (const u of urls) {
      const im = new Image();
      im.src = u;
    }
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      if (i >= urls.length) {
        if (!repite) {
          window.clearInterval(id);
          onFin?.();
          return;
        }
        i = 0;
      }
      setFrame(i);
    }, ms);
    return () => window.clearInterval(id);
  }, [urls, ms, repite, quieto, pausado]);

  const lado = 32 * Math.max(1, Math.round(escala));
  return (
    <img
      className={`sprite ${className ?? ""}`}
      src={urls[Math.min(frame, urls.length - 1)]}
      alt={alt}
      width={lado}
      height={lado}
      draggable={false}
      data-sprite={resolverSprite(nombre)}
      data-anim={anim}
      style={{ imageRendering: "pixelated", ...style }}
    />
  );
}

/** Sprite de mascota a partir de la `especie` que manda la API (EstadoMascota.especie). */
export const spriteMascota = (especie: string) => `mascota/${especie}`;
/** Sprite del héroe del jugador según el tier (1..6). */
export const spriteHeroe = (tier: number) => `heroe/tier${Math.max(1, Math.min(6, tier))}`;
/** Sprite de un ítem del inventario o la tienda por su `item_id`. */
export const spriteItem = (itemId: string) =>
  itemId.startsWith("mascota_") ? `mascota/${itemId.slice(8)}` : `item/${itemId}`;
/** Ícono de la navegación y la UI. */
export const spriteIcono = (id: string) => `icono/${id}`;
/** Sprite de cofre por el `tipo` de la API ("normal" | "legendario"). */
export const spriteCofre = (tipo: string) => (tipo === "legendario" ? "cofre/legendario" : "cofre/normal");

const deRol = (rol: FichaPersonaje["rol"]) => FICHAS.filter((f) => f.rol === rol);

/** Héroe: 6 atuendos (tier1 Brote → tier6 Leyenda). */
export const HEROES: FichaPersonaje[] = deRol("heroe");
/** Compañeros tiernos: 3 comunes, 2 raras, 3 legendarias. */
export const MASCOTAS: FichaPersonaje[] = deRol("mascota");
/** Sabios que hacen las preguntas (el búho bibliotecario es el principal). Incluye skins (`variante_de`). */
export const ANFITRIONES: FichaPersonaje[] = deRol("anfitrion");
/** Monstruos del nivel final; los que tienen `jefe: true` son jefes (Ónix, el caballero negro, y el ogro jefe). */
export const ENEMIGOS: FichaPersonaje[] = deRol("enemigo");

/** Ficha por nombre de sprite (acepta alias). */
export function fichaPersonaje(nombre: string): FichaPersonaje | undefined {
  const n = resolverSprite(nombre);
  return FICHAS.find((f) => f.id === n);
}

/** Ficha de mascota a partir de la `especie` de la API. */
export const fichaMascota = (especie: string) => fichaPersonaje(spriteMascota(especie));
