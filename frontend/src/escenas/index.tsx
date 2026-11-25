/**
 * CONTRATO DE ESCENAS (dueño: agente `escenas`). Fondos animados por capas (parallax),
 * detrás del contenido. Los demás agentes solo IMPORTAN de aquí.
 *
 * <Escena bioma="pradera"> pinta un fondo pixel-art de 5–7 capas (cielo, nubes, montañas, árboles que
 * se mecen con el viento, partículas…) fijo detrás de la pantalla, con parallax suave al mover el
 * puntero y al hacer scroll. Solo se animan `transform` y `opacity`.
 * `intensidad` (0..1) baja la amplitud del viento y la opacidad de las partículas; 0, la preferencia
 * del jugador en Ajustes y `prefers-reduced-motion: reduce` congelan todo.
 * La paleta activa del jugador (variables --c-*) tiñe la escena; con la paleta "gris" el mundo se
 * ve dormido (desaturado) hasta que el jugador gana color.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from "react";
import { CAPAS, type Capa } from "./biomas";
import "./escenas.css";

export type Bioma =
  | "pradera" // inicio y camino
  | "bosque"
  | "biblioteca" // aula / revisión
  | "cueva"
  | "castillo" // nivel final
  | "noche"
  | "tienda"
  | "perfil";

export const BIOMAS: Bioma[] = ["pradera", "bosque", "biblioteca", "cueva", "castillo", "noche", "tienda", "perfil"];

export interface EscenaProps {
  bioma: Bioma;
  /** 0..1: intensidad de animación (viento, partículas). 0 respeta reduced-motion. */
  intensidad?: number;
  children?: ReactNode;
  className?: string;
  /**
   * "pantalla" (por defecto): el fondo queda fijo detrás de toda la ventana.
   * "caja": el fondo llena solo el contenedor (tarjetas, portadas, diálogos).
   */
  modo?: "pantalla" | "caja";
}

/** Capas de un bioma con su URL pública (útil para precargar o para portadas). */
export const capasDe = (bioma: Bioma): (Capa & { url: string })[] =>
  CAPAS[bioma].map((c) => ({ ...c, url: `/fondos/${bioma}/${c.archivo}` }));

/** Bioma estable para un curso (mismo curso → mismo mundo). */
const MUNDOS_CURSO: Bioma[] = ["pradera", "bosque", "noche", "cueva"];
export function biomaDeCurso(curso: { id: string | number; tema?: string | null } | null | undefined): Bioma {
  if (!curso) return "pradera";
  const llave = `${curso.tema ?? ""}#${curso.id}`;
  let h = 0;
  for (const ch of llave) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return MUNDOS_CURSO[h % MUNDOS_CURSO.length];
}

// ---------------------------------------------------------------- preferencia global de animación
const LLAVE = "pixtart.animaciones";
const EVENTO = "pixtart:animaciones";
export type NivelAnimacion = "completa" | "suave" | "apagada";
const VALOR: Record<NivelAnimacion, number> = { completa: 1, suave: 0.5, apagada: 0 };

function leerNivel(): NivelAnimacion {
  try {
    const v = localStorage.getItem(LLAVE);
    return v === "suave" || v === "apagada" ? v : "completa";
  } catch {
    return "completa";
  }
}
export function guardarNivelAnimacion(n: NivelAnimacion): void {
  try { localStorage.setItem(LLAVE, n); } catch { /* sin almacenamiento: solo esta sesión */ }
  window.dispatchEvent(new Event(EVENTO));
}
function suscribir(cb: () => void) {
  window.addEventListener(EVENTO, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENTO, cb); window.removeEventListener("storage", cb); };
}
/** Preferencia del jugador (Ajustes → Animaciones). */
export function useNivelAnimacion(): NivelAnimacion {
  return useSyncExternalStore(suscribir, leerNivel, () => "completa" as NivelAnimacion);
}

const consultaReducido = () =>
  typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
function useMovimientoReducido(): boolean {
  const [r, setR] = useState(() => !!consultaReducido()?.matches);
  useEffect(() => {
    const q = consultaReducido();
    if (!q) return;
    const f = () => setR(q.matches);
    q.addEventListener?.("change", f);
    return () => q.removeEventListener?.("change", f);
  }, []);
  return r;
}

/** Intensidad efectiva (0..1) tras aplicar la preferencia del jugador y la del sistema. */
export function useIntensidad(pedida = 1): number {
  const nivel = useNivelAnimacion();
  const reducido = useMovimientoReducido();
  if (reducido) return 0;
  return Math.max(0, Math.min(1, pedida, VALOR[nivel]));
}

// ---------------------------------------------------------------- SVG en línea (con caché)
const PRUEBAS = import.meta.env.MODE === "test";
const textos = new Map<string, string>();
const pendientes = new Map<string, Promise<string>>();

function limpiar(t: string): string {
  return t
    .replace(/<\?xml[^>]*\?>/, "")
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(/<svg([^>]*?) width="\d+" height="\d+"/, '<svg$1 aria-hidden="true" focusable="false"');
}
function cargarSvg(url: string): Promise<string> {
  const ya = pendientes.get(url);
  if (ya) return ya;
  const p = fetch(url)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
    .then((t) => {
      if (!t.includes("<svg")) throw new Error("no es svg");
      const l = limpiar(t);
      textos.set(url, l);
      return l;
    });
  pendientes.set(url, p);
  p.catch(() => pendientes.delete(url));
  return p;
}

function CapaViva({ url }: { url: string }) {
  const [html, setHtml] = useState<string | null>(() => textos.get(url) ?? null);
  useEffect(() => {
    if (PRUEBAS || textos.has(url)) return;
    let vivo = true;
    cargarSvg(url).then((t) => vivo && setHtml(t)).catch(() => vivo && setHtml(""));
    return () => { vivo = false; };
  }, [url]);
  // Respaldo: imagen estática (sin viento) en pruebas o si fetch falla.
  if (PRUEBAS || html === "") return <img src={url} alt="" draggable={false} />;
  if (html === null) return null;
  return <div className="capa-svg" dangerouslySetInnerHTML={{ __html: html }} />;
}

// ---------------------------------------------------------------- parallax
function useParallax(raiz: RefObject<HTMLDivElement>, activo: boolean, fijo: boolean) {
  useEffect(() => {
    const el = raiz.current;
    if (!el || !activo || typeof window === "undefined") return;
    const capas = [...el.querySelectorAll<HTMLElement>(".capa[data-d]")].map((c) => ({ c, d: Number(c.dataset.d) }));
    let px = 0, py = 0, sy = 0, raf = 0;
    const pinta = () => {
      raf = 0;
      for (const { c, d } of capas) {
        const dy = py * d * 0.8 - Math.min(d * 5, sy * d * 0.012);
        c.style.transform = `translate3d(${(px * d * 2).toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
      }
    };
    const pide = () => { if (!raf) raf = requestAnimationFrame(pinta); };
    const fino = window.matchMedia?.("(pointer: fine)").matches;
    const mueve = (e: PointerEvent) => {
      px = -((e.clientX / window.innerWidth) * 2 - 1);
      py = -((e.clientY / window.innerHeight) * 2 - 1);
      pide();
    };
    const sale = () => { px = 0; py = 0; pide(); };
    const scroll = () => { sy = window.scrollY; pide(); };
    if (fino) {
      window.addEventListener("pointermove", mueve, { passive: true });
      document.documentElement.addEventListener("pointerleave", sale);
    }
    if (fijo) window.addEventListener("scroll", scroll, { passive: true });
    scroll();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", mueve);
      document.documentElement.removeEventListener("pointerleave", sale);
      window.removeEventListener("scroll", scroll);
      for (const { c } of capas) c.style.transform = "";
    };
  }, [raiz, activo, fijo]);
}

// ---------------------------------------------------------------- componente
export function Escena({ bioma, intensidad = 1, children, className, modo = "pantalla" }: EscenaProps) {
  const int = useIntensidad(intensidad);
  const fondo = useRef<HTMLDivElement>(null);
  useParallax(fondo, int > 0, modo === "pantalla");
  const capas = capasDe(bioma in CAPAS ? bioma : "pradera");
  const estilo = { "--amp": int, "--part": 0.35 + 0.65 * int } as CSSProperties;
  return (
    <div className={`escena escena-${bioma} escena--${modo} ${int === 0 ? "escena-quieta" : ""} ${className ?? ""}`}
      data-bioma={bioma} data-testid="escena" style={estilo}>
      <div className="escena-fondo" ref={fondo} aria-hidden="true">
        <div className="escena-lienzo">
          {capas.map((c) => (
            <div key={c.url} className={`capa ${c.particulas ? "capa-particulas" : ""}`} data-d={c.d}>
              {c.viva ? <CapaViva url={c.url} /> : <img src={c.url} alt="" draggable={false} />}
            </div>
          ))}
        </div>
        <div className="escena-tinte" />
        <div className="escena-velo" />
      </div>
      <div className="escena-contenido">{children}</div>
    </div>
  );
}

/** Portada estática de un bioma (sin animación ni SVG en línea): para tarjetas y miniaturas. */
export function Portada({ bioma, className }: { bioma: Bioma; className?: string }) {
  return (
    <div className={`escena-portada escena-${bioma} ${className ?? ""}`} aria-hidden="true">
      {capasDe(bioma).filter((c) => !c.particulas).map((c) => <img key={c.url} src={c.url} alt="" draggable={false} loading="lazy" />)}
    </div>
  );
}

export { SpriteSeguro } from "./SpriteSeguro";
