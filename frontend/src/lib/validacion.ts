/** Edad cumplida en años a la fecha `hoy` (fecha "YYYY-MM-DD"). */
export function edad(fechaNacimiento: string, hoy: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaNacimiento);
  if (!m) return null;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let e = hoy.getFullYear() - a;
  if (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < d)) e--;
  return e;
}

export const esMayorDeEdad = (f: string, hoy?: Date) => (edad(f, hoy) ?? -1) >= 18;

export const correoValido = (c: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.trim());

export function zonaHoraria(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export const mensajeError = (e: unknown) => (e instanceof Error ? e.message : "Algo salió mal. Inténtalo de nuevo.");
