// Límites de subida de PDFs (iguales a los del backend, ver CONTRATO «Cursos desde PDF»).
// El total de páginas (≤ 600) solo lo puede comprobar el servidor.

const MB = 1024 * 1024;
export const MAX_PDF = 25 * MB;
export const MAX_TOTAL = 100 * MB;
export const MAX_ARCHIVOS = 10;
export const MAX_PAGINAS_TOTAL = 600;

export function tamanoLegible(bytes: number): string {
  if (bytes < MB) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

const esPdf = (f: File) => /\.pdf$/i.test(f.name) || f.type === "application/pdf";
const mismo = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

/** Problema de un archivo por sí solo (o null si está bien). */
export function problemaArchivo(f: File): string | null {
  if (!esPdf(f)) return `«${f.name}» no es un PDF.`;
  if (f.size > MAX_PDF) return `«${f.name}» pesa más de 25 MB (${tamanoLegible(f.size)}), el máximo por archivo.`;
  return null;
}

/**
 * Añade `nuevos` a `actuales` respetando los límites. Devuelve la lista resultante y un mensaje
 * por cada archivo rechazado.
 */
export function agregarPdfs(actuales: File[], nuevos: File[]): { archivos: File[]; rechazos: string[] } {
  const archivos = [...actuales];
  const rechazos: string[] = [];
  let total = archivos.reduce((s, f) => s + f.size, 0);
  for (const f of nuevos) {
    const p = problemaArchivo(f);
    if (p) rechazos.push(p);
    else if (archivos.some((a) => mismo(a, f))) rechazos.push(`«${f.name}» ya está en la lista.`);
    else if (archivos.length >= MAX_ARCHIVOS) rechazos.push(`«${f.name}» no se añadió: el máximo es ${MAX_ARCHIVOS} PDFs.`);
    else if (total + f.size > MAX_TOTAL) rechazos.push(`«${f.name}» no se añadió: entre todos superarían los 100 MB.`);
    else {
      archivos.push(f);
      total += f.size;
    }
  }
  return { archivos, rechazos };
}

/** Error de la lista completa antes de enviar (o null). */
export function problemaLista(archivos: File[]): string | null {
  if (!archivos.length) return "Elige al menos un PDF.";
  for (const f of archivos) {
    const p = problemaArchivo(f);
    if (p) return p;
  }
  if (archivos.length > MAX_ARCHIVOS) return `Puedes subir como máximo ${MAX_ARCHIVOS} PDFs.`;
  if (archivos.reduce((s, f) => s + f.size, 0) > MAX_TOTAL) return "Entre todos los PDFs superan los 100 MB.";
  return null;
}
