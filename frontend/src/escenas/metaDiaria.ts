/**
 * Meta diaria (solo frontend, mientras la API no la exponga): niveles completados HOY.
 * Al primer vistazo del día se guarda cuántos nodos completados tenía cada curso; lo jugado hoy
 * es la diferencia con el conteo actual. Nada inventado: si no hay almacenamiento, cuenta 0.
 */
const LLAVE = "pixtart.meta-diaria";
export const META_DIARIA = 3;

interface Registro { dia: string; base: Record<string, number>; ultimo?: Record<string, number> }

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

function leer(): Registro {
  try {
    const r = JSON.parse(localStorage.getItem(LLAVE) ?? "null") as Registro | null;
    if (r && r.dia === hoy() && r.base && typeof r.base === "object") return r;
  } catch { /* sin almacenamiento */ }
  return { dia: hoy(), base: {} };
}

/** Niveles completados hoy sumando todos los cursos vistos; registra el conteo actual de `cursoId`. */
export function avanceDeHoy(cursoId: string, completadosAhora: number): number {
  const r = leer();
  const ultimo = (r.ultimo ??= {});
  if (!(cursoId in r.base)) r.base[cursoId] = completadosAhora;
  ultimo[cursoId] = completadosAhora;
  try { localStorage.setItem(LLAVE, JSON.stringify(r)); } catch { /* sin almacenamiento */ }
  return Object.keys(r.base).reduce((s, k) => s + Math.max(0, (ultimo[k] ?? r.base[k]) - r.base[k]), 0);
}
