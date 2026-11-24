import datos from "./paletas.json";

export interface Paleta {
  id: string;
  nombre: string;
  xp_color_min: number;
  colores: Record<string, string>;
}

export const PALETAS: Paleta[] = datos.paletas as Paleta[];

export function paletaPorId(id: string | null | undefined): Paleta {
  return PALETAS.find((p) => p.id === id) ?? PALETAS.find((p) => p.id === "pradera")!;
}

/** Recolorea la UI: cada rol de la paleta se vuelve una variable CSS `--c-<rol>`. */
export function aplicarPaleta(id: string | null | undefined, raiz: HTMLElement = document.documentElement): void {
  const p = paletaPorId(id);
  for (const [rol, hex] of Object.entries(p.colores)) raiz.style.setProperty(`--c-${rol}`, hex);
  raiz.dataset.paleta = p.id;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", p.colores.fondo);
}
