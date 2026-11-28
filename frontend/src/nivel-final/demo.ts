/**
 * Modo demostración (`/final/demo`): un «servidor» local con las mismas reglas que
 * `app/play/final.py`, para probar el nivel final sin backend ni curso. No da recompensas reales.
 */
import type { Api, PreguntaJugable, RespuestaPregunta } from "../api";
import { calcularProgreso, planEncuentros, requeridas, type FinFinal, type IntentoFinal, type RespuestaFinal } from "./logica";

export type ApiFinal = Pick<Api, "iniciarNivel" | "responder" | "revisarRespuesta" | "terminar" | "abrirCofre" | "camino">;

interface PreguntaDemo {
  p: PreguntaJugable;
  correcta: RespuestaPregunta;
  explicacion: string;
}

const mc = (id: string, enunciado: string, opciones: string[], correcta: number, explicacion: string, dificultad = 2): PreguntaDemo => ({
  p: { id, tipo: "multiple_choice", enunciado, opciones, dificultad, tiempo_s: 30 },
  correcta,
  explicacion,
});
const vf = (id: string, enunciado: string, correcta: boolean, explicacion: string, dificultad = 1): PreguntaDemo => ({
  p: { id, tipo: "true_false", enunciado, opciones: null, dificultad, tiempo_s: 20 },
  correcta,
  explicacion,
});
const fill = (id: string, enunciado: string, aceptadas: string[], explicacion: string, dificultad = 3): PreguntaDemo => ({
  p: { id, tipo: "fill_code", enunciado, opciones: null, dificultad, tiempo_s: 40 },
  correcta: aceptadas,
  explicacion,
});

export const PREGUNTAS_DEMO: PreguntaDemo[] = [
  vf("d1", "Una expresión regular describe un patrón de texto.", true, "Una regex describe un conjunto de cadenas."),
  mc("d2", "¿Con qué coincide el metacaracter `.`?", ["Cualquier carácter (salvo salto de línea)", "Solo un punto", "Un dígito", "El final de línea"], 0, "`.` es un comodín de un carácter."),
  mc("d3", "¿Qué significa `a+`?", ["Una o más «a»", "Cero o más «a»", "Exactamente una «a»", "Cero o una «a»"], 0, "`+` repite una o más veces."),
  vf("d4", "`[^0-9]` coincide con un dígito.", false, "`^` dentro de corchetes niega la clase.", 2),
  mc("d5", "¿Qué cadena coincide completa con `colou?r`?", ["color", "colouur", "colr", "coloor"], 0, "`u?` permite cero o una «u».", 3),
  fill("d6", "Completa el cuantificador de exactamente 3 dígitos: `\\d___`", ["{3}"], "Las llaves fijan las repeticiones: `\\d{3}`."),
  mc("d7", "¿Qué devuelve `re.findall(r\"a.?\", \"abc\")`?", ["['ab']", "['a']", "['abc']", "['a', 'b', 'c']"], 0, "`?` es codicioso y toma la «b».", 4),
  mc("d8", "¿Cuál coincide con `\\bsol\\b`?", ["«el sol sale»", "«girasol»", "«soleado»", "«consola»"], 0, "`\\b` exige límite de palabra.", 4),
];

function corregir(d: PreguntaDemo, r: RespuestaPregunta | null): boolean {
  if (r === null) return false;
  if (Array.isArray(d.correcta) && typeof r === "string") {
    return (d.correcta as string[]).some((a) => a.trim().toLowerCase() === r.trim().toLowerCase());
  }
  return r === d.correcta;
}

export function crearApiDemo(g = 70, preguntas: PreguntaDemo[] = PREGUNTAS_DEMO): ApiFinal {
  let resueltas = new Map<string, boolean>();
  const n = preguntas.length;
  const req = requeridas(n, g);
  const progreso = () => {
    const v = [...resueltas.values()];
    return calcularProgreso(n, req, v.filter(Boolean).length, v.filter((x) => !x).length);
  };
  const plan = planEncuentros(n);
  const furia = plan[plan.length - 1].fase2_desde ?? n;

  return {
    async camino() {
      return { secciones: [{ id: "demo", titulo: "Demostración", niveles: [] }] };
    },
    async iniciarNivel(): Promise<IntentoFinal> {
      resueltas = new Map();
      return {
        intento_id: "demo",
        preguntas: preguntas.map((d, i) => ({ ...d.p, tiempo_s: i >= furia ? Math.max(8, Math.floor(d.p.tiempo_s * 0.75)) : d.p.tiempo_s })),
        final: { ...progreso(), g, n_configurado: n, encuentros: plan },
      };
    },
    async responder(_id, e): Promise<RespuestaFinal> {
      const d = preguntas.find((x) => x.p.id === e.pregunta_id);
      if (!d) throw new Error("Pregunta desconocida");
      if (progreso().resultado === "derrota") throw new Error("El examen terminó: el aprobado ya no es alcanzable.");
      const correcta = corregir(d, e.respuesta);
      resueltas.set(String(e.pregunta_id), correcta);
      return { correcta, respuesta_correcta: d.correcta, explicacion: d.explicacion, vidas: 10, mascota: null, xp_ganada: correcta ? 10 : 0, final: progreso() };
    },
    async revisarRespuesta(_id, _preguntaId, _respuesta, _imagen) {
      return { retroalimentacion: "Revisión de demostración: compara tu procedimiento con la explicación." };
    },
    async terminar(): Promise<FinFinal> {
      const p = progreso();
      const aprobado = p.resultado === "victoria";
      return {
        xp_ganada: p.aciertos * 10 + (aprobado ? 120 : 0),
        monedas: aprobado ? 15 : 0,
        drop: null,
        cofre: aprobado ? { id: "demo-cofre", tipo: "legendario" } : null,
        perfecto: aprobado && p.aciertos === n,
        vidas: 10,
        final: { ...p, aprobado },
      };
    },
    async abrirCofre() {
      return { items: [{ item_id: "mascota_crystal-owl", nombre: "Búho de cristal (demo)", rareza: "legendaria" }], monedas: 120 };
    },
  };
}
