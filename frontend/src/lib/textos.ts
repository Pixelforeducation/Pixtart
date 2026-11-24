import type { EstadoTrabajo, TipoPregunta } from "../api";

export const NOMBRE_TIPO: Record<TipoPregunta, string> = {
  multiple_choice: "Opción múltiple",
  true_false: "Verdadero / falso",
  fill_text: "Completar texto",
  fill_code: "Completar código",
  numeric: "Numérica",
  ordering: "Ordenar pasos",
  open: "Abierta",
  math_problem: "Problema matemático",
  proof: "Demostración",
};

export const NOMBRE_ESTADO_TRABAJO: Record<EstadoTrabajo, string> = {
  subiendo: "Subiendo el PDF",
  leyendo: "Leyendo el texto",
  ocr: "Reconociendo texto escaneado (OCR)",
  analizando: "Analizando los temas",
  generando: "Generando preguntas",
  validando: "Validando preguntas",
  listo: "¡Listo!",
  error: "Hubo un error",
};
