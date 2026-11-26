// Token en memoria + localStorage: sobrevive a cerrar/reabrir la pestaña (antes vivía en
// sessionStorage y cerrar la pestaña a media partida cerraba la sesión).
const CLAVE = "pixtart.token";
let token: string | null = null;
let cargado = false;
const oyentes = new Set<() => void>();

function leer(): string | null {
  try {
    const t = localStorage.getItem(CLAVE);
    if (t) return t;
  } catch {
    /* sin localStorage: se mira sessionStorage */
  }
  // Migración: un token guardado por versiones anteriores en sessionStorage pasa a localStorage.
  try {
    const viejo = sessionStorage.getItem(CLAVE);
    if (!viejo) return null;
    try {
      localStorage.setItem(CLAVE, viejo);
      sessionStorage.removeItem(CLAVE);
    } catch {
      /* se queda donde estaba */
    }
    return viejo;
  } catch {
    return null;
  }
}

export function obtenerToken(): string | null {
  if (!cargado) {
    token = leer();
    cargado = true;
  }
  return token;
}

export function guardarToken(t: string | null): void {
  token = t;
  cargado = true;
  try {
    if (t) localStorage.setItem(CLAVE, t);
    else localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento: queda solo en memoria */
  }
  if (!t) {
    try {
      sessionStorage.removeItem(CLAVE);
    } catch {
      /* nada */
    }
  }
  oyentes.forEach((f) => f());
}

export function alCambiarToken(f: () => void): () => void {
  oyentes.add(f);
  return () => oyentes.delete(f);
}
