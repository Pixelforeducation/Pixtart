/**
 * Partículas pixel en un <canvas> fijo encima de la página (requestAnimationFrame, sin dependencias).
 * `lanzar()` se puede llamar desde cualquier parte; `<CapaParticulas />` las dibuja.
 * Con prefers-reduced-motion no se dibuja nada y los callbacks se llaman al instante.
 */
import { useEffect, useRef } from "react";
import { menosMovimiento } from "./movimiento";

export type TipoParticula = "xp" | "moneda" | "chispa" | "confeti" | "humo" | "estrella";
export interface Punto { x: number; y: number }

export interface Rafaga {
  tipo: TipoParticula;
  desde: Punto;
  /** Si se da, las partículas vuelan hacia ese punto (p. ej. el contador del HUD). */
  hacia?: Punto | null;
  cantidad?: number;
  /** Se llama cada vez que una partícula llega a `hacia` (para el "pop" del contador). */
  alLlegar?: (i: number, total: number) => void;
}

interface P {
  tipo: TipoParticula;
  x: number; y: number; vx: number; vy: number;
  x0: number; y0: number; cx: number; cy: number; tx: number; ty: number;
  vida: number; max: number; espera: number; rot: number; vr: number; color: string; tam: number;
  dirigida: boolean; i: number; total: number; alLlegar?: Rafaga["alLlegar"];
}

const oyentes = new Set<(r: Rafaga) => void>();

/** Centro de un elemento en coordenadas de la ventana. */
export function centro(el: Element | null | undefined): Punto | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function lanzar(r: Rafaga) {
  const n = r.cantidad ?? 12;
  if (menosMovimiento() || oyentes.size === 0) {
    if (r.hacia && r.alLlegar) for (let i = 0; i < n; i++) r.alLlegar(i, n);
    return;
  }
  oyentes.forEach((f) => f(r));
}

const COLORES: Record<TipoParticula, string[]> = {
  xp: ["#FFE27A", "#F2C230", "#FFF6D8"],
  moneda: ["#F2C230", "#C8941A", "#FFF1A0"],
  chispa: ["#FFF6D8", "#FFE27A", "#58C94A", "#8FB8FF"],
  confeti: ["#E04848", "#F2C230", "#58C94A", "#5FA8E8", "#FFE27A", "#8FB8FF", "#FF8A8A"],
  humo: ["#A3A3AE", "#7A7A86", "#D8D0B8"],
  estrella: ["#FFE27A", "#FFF6D8", "#F2C230"],
};

function crear(r: Rafaga): P[] {
  const n = r.cantidad ?? 12;
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const vel = r.tipo === "confeti" || r.tipo === "estrella" ? 4 + Math.random() * 7 : r.tipo === "humo" ? 0.6 + Math.random() * 1.2 : 2 + Math.random() * 4;
    const color = COLORES[r.tipo][i % COLORES[r.tipo].length];
    const dirigida = !!r.hacia && (r.tipo === "xp" || r.tipo === "moneda");
    const tx = r.hacia?.x ?? 0, ty = r.hacia?.y ?? 0;
    const dispersion = 90;
    out.push({
      tipo: r.tipo, i, total: n, alLlegar: r.alLlegar, dirigida,
      x: r.desde.x, y: r.desde.y,
      vx: r.tipo === "confeti" || r.tipo === "estrella" ? (Math.random() - 0.5) * 12 : Math.cos(ang) * vel,
      vy: r.tipo === "confeti" || r.tipo === "estrella" ? -vel - Math.random() * 6 : r.tipo === "humo" ? -0.8 - Math.random() : Math.sin(ang) * vel,
      x0: r.desde.x, y0: r.desde.y,
      cx: r.desde.x + (Math.random() - 0.5) * dispersion * 2, cy: Math.min(r.desde.y, ty) - 40 - Math.random() * dispersion,
      tx, ty,
      vida: 0,
      max: dirigida ? 650 + Math.random() * 250 : r.tipo === "confeti" || r.tipo === "estrella" ? 1800 + Math.random() * 900 : r.tipo === "humo" ? 700 + Math.random() * 300 : 450 + Math.random() * 250,
      espera: dirigida ? i * 45 : 0,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      color, tam: r.tipo === "confeti" ? 6 + Math.floor(Math.random() * 4) : r.tipo === "humo" ? 8 + Math.random() * 8 : 4,
    });
  }
  return out;
}

const easeIn = (t: number) => t * t * t;

function dibujar(g: CanvasRenderingContext2D, p: P) {
  const k = Math.min(1, p.vida / p.max);
  const x = Math.round(p.x), y = Math.round(p.y);
  if (p.tipo === "moneda") {
    g.fillStyle = "#2A1A0E"; g.fillRect(x - 6, y - 6, 12, 12);
    g.fillStyle = "#F2C230"; g.fillRect(x - 4, y - 6, 8, 12); g.fillRect(x - 6, y - 4, 12, 8);
    g.fillStyle = "#FFF1A0"; g.fillRect(x - 2, y - 4, 2, 6);
    return;
  }
  if (p.tipo === "estrella") {
    // Estrella grande de 5 puntas en pixeles, que se apaga al final.
    g.globalAlpha = Math.min(1, 3 * (1 - k));
    g.fillStyle = "#C8941A"; g.fillRect(x - 3, y - 9, 6, 18); g.fillRect(x - 9, y - 3, 18, 6);
    g.fillStyle = p.color; g.fillRect(x - 1, y - 7, 2, 14); g.fillRect(x - 7, y - 1, 14, 2); g.fillRect(x - 3, y - 3, 6, 6);
    g.globalAlpha = 1;
    return;
  }
  if (p.tipo === "xp") {
    // Estrellita en cruz.
    g.fillStyle = "#C8941A"; g.fillRect(x - 2, y - 6, 4, 12); g.fillRect(x - 6, y - 2, 12, 4);
    g.fillStyle = "#FFE27A"; g.fillRect(x - 1, y - 5, 2, 10); g.fillRect(x - 5, y - 1, 10, 2);
    return;
  }
  g.globalAlpha = p.tipo === "confeti" ? Math.min(1, 3 * (1 - k)) : 1 - k;
  g.fillStyle = p.color;
  if (p.tipo === "confeti") {
    g.save(); g.translate(x, y); g.rotate(p.rot);
    g.fillRect(-p.tam / 2, -p.tam / 4, p.tam, p.tam / 2);
    g.restore();
  } else {
    const t = p.tipo === "humo" ? p.tam * (0.6 + k) : p.tam;
    g.fillRect(x - t / 2, y - t / 2, t, t);
  }
  g.globalAlpha = 1;
}

const ESTILO_CAPA = { position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 60 } as const;

export function CapaParticulas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext?.("2d") ?? null;
    if (!canvas || !g) return; // jsdom: sin canvas, lanzar() sigue llamando los callbacks
    let vivas: P[] = [];
    let raf = 0;
    let ultimo = 0;
    const ajustar = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.imageSmoothingEnabled = false;
    };
    ajustar();
    const paso = (t: number) => {
      const dt = Math.min(50, ultimo ? t - ultimo : 16);
      ultimo = t;
      g.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const siguen: P[] = [];
      for (const p of vivas) {
        if (p.espera > 0) { p.espera -= dt; siguen.push(p); continue; }
        p.vida += dt;
        if (p.dirigida) {
          const k = Math.min(1, p.vida / p.max);
          const e = easeIn(k);
          // Curva cuadrática: sale disparada hacia arriba y cae en el contador.
          p.x = (1 - e) * (1 - e) * p.x0 + 2 * (1 - e) * e * p.cx + e * e * p.tx;
          p.y = (1 - e) * (1 - e) * p.y0 + 2 * (1 - e) * e * p.cy + e * e * p.ty;
          if (k >= 1) { p.alLlegar?.(p.i, p.total); continue; }
        } else {
          p.x += p.vx * (dt / 16);
          p.y += p.vy * (dt / 16);
          if (p.tipo === "confeti" || p.tipo === "estrella") { p.vy += 0.25 * (dt / 16); p.vx *= 0.99; p.rot += p.vr; }
          else if (p.tipo === "chispa") { p.vx *= 0.92; p.vy *= 0.92; }
          if (p.vida >= p.max) continue;
        }
        dibujar(g, p);
        siguen.push(p);
      }
      vivas = siguen;
      raf = vivas.length ? requestAnimationFrame(paso) : 0;
      if (!raf) { ultimo = 0; g.clearRect(0, 0, window.innerWidth, window.innerHeight); }
    };
    const oyente = (r: Rafaga) => {
      vivas.push(...crear(r));
      if (!raf) raf = requestAnimationFrame(paso);
    };
    oyentes.add(oyente);
    window.addEventListener("resize", ajustar);
    return () => {
      oyentes.delete(oyente);
      window.removeEventListener("resize", ajustar);
      cancelAnimationFrame(raf);
      // Las que iban en vuelo cumplen su promesa para que los contadores cuadren.
      for (const p of vivas) if (p.dirigida) p.alLlegar?.(p.i, p.total);
    };
  }, []);

  // Estilo en línea: la capa funciona en cualquier pantalla sin depender de una hoja de estilos.
  return <canvas ref={ref} className="jg-particulas" aria-hidden="true" style={ESTILO_CAPA} />;
}
