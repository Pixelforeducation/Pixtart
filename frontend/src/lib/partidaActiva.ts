const CLAVE_RUTA_PARTIDA = "pixtart.ruta-partida-activa";

type ModoPartida = "jugar" | "final";

export function guardarPartidaActiva(modo: ModoPartida, nivelId: string, cursoId: string | null): void {
  const ruta = `/${modo}/${encodeURIComponent(nivelId)}${cursoId ? `?curso=${encodeURIComponent(cursoId)}` : ""}`;
  sessionStorage.setItem(CLAVE_RUTA_PARTIDA, ruta);
}

export function obtenerRutaPartidaActiva(): string | null {
  const ruta = sessionStorage.getItem(CLAVE_RUTA_PARTIDA);
  return ruta && /^\/(?:jugar|final)\/[^/?#]+(?:\?curso=[^&#]*)?$/.test(ruta) ? ruta : null;
}

export function limpiarPartidaActiva(): void {
  sessionStorage.removeItem(CLAVE_RUTA_PARTIDA);
}
