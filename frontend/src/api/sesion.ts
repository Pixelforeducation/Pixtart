// Token en memoria + sessionStorage (se pierde al cerrar la pestaña).
const CLAVE = "pixtart.token";
let token: string | null = null;
let cargado = false;
const oyentes = new Set<() => void>();

function leer(): string | null {
  try {
    return sessionStorage.getItem(CLAVE);
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
    if (t) sessionStorage.setItem(CLAVE, t);
    else sessionStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento: queda solo en memoria */
  }
  oyentes.forEach((f) => f());
}

export function alCambiarToken(f: () => void): () => void {
  oyentes.add(f);
  return () => oyentes.delete(f);
}
