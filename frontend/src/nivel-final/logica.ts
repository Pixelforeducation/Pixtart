/**
 * Lógica del nivel final, sin motor ni DOM (se testea sin canvas).
 * El servidor es la autoridad (`final` en iniciar/responder/terminar, CONTRATO «Nivel final v0.2»);
 * estas funciones replican sus reglas para pintar el HUD y para cuando el backend aún no manda `final`.
 */
import type { FinIntento, IntentoIniciado, ResultadoRespuesta } from "../api";

export type TipoEncuentro = "comun" | "raro" | "jefe";
export type Resultado = "en_curso" | "victoria" | "derrota";

export interface Encuentro {
  tipo: TipoEncuentro;
  desde: number;
  cuantas: number;
  fase2_desde?: number;
}

export interface ProgresoFinal {
  n: number;
  requeridas: number;
  aciertos: number;
  fallos: number;
  restantes: number;
  margen: number;
  corazones: number;
  resultado: Resultado;
}

export interface InfoFinal extends ProgresoFinal {
  g: number;
  n_configurado?: number;
  encuentros: Encuentro[];
}

export type IntentoFinal = IntentoIniciado & { final?: InfoFinal };
export type RespuestaFinal = ResultadoRespuesta & { final?: ProgresoFinal };
export type FinFinal = FinIntento & { final?: ProgresoFinal & { aprobado: boolean } };

export const G_POR_DEFECTO = 70;

/** ceil(N·g/100) en enteros. */
export function requeridas(n: number, g: number): number {
  return Math.floor((n * g + 99) / 100);
}

export function preguntasJefe(n: number): number {
  if (n < 4) return 1;
  return Math.max(2, Math.round(0.35 * n));
}

/** Mismo reparto que `app/play/final.py::plan_encuentros`. */
export function planEncuentros(n: number): Encuentro[] {
  const jefe = preguntasJefe(n);
  const guardia = n - jefe;
  const res: Encuentro[] = [];
  let i = 0;
  let paso = 0;
  while (i < guardia) {
    const raro = paso % 3 === 2 && guardia - i >= 2;
    const cuantas = raro ? 2 : 1;
    res.push({ tipo: raro ? "raro" : "comun", desde: i, cuantas });
    i += cuantas;
    paso++;
  }
  const enc: Encuentro = { tipo: "jefe", desde: guardia, cuantas: jefe };
  if (jefe >= 2) enc.fase2_desde = guardia + Math.ceil(jefe / 2);
  res.push(enc);
  return res;
}

export function calcularProgreso(n: number, req: number, aciertos: number, fallos: number): ProgresoFinal {
  const margen = n - req;
  const restantes = n - aciertos - fallos;
  const resultado: Resultado = aciertos >= req ? "victoria" : fallos > margen ? "derrota" : "en_curso";
  return { n, requeridas: req, aciertos, fallos, restantes, margen, corazones: Math.max(0, margen - fallos), resultado };
}

/** Info del examen: la del servidor, o una calculada si el backend no la manda (versión vieja). */
export function infoDesde(intento: IntentoFinal): InfoFinal {
  if (intento.final) return intento.final;
  const n = intento.preguntas.length;
  const req = requeridas(n, G_POR_DEFECTO);
  return { ...calcularProgreso(n, req, 0, 0), g: G_POR_DEFECTO, encuentros: planEncuentros(n) };
}

/** Aplica una respuesta: si el servidor manda `final`, manda él. */
export function aplicarRespuesta(p: ProgresoFinal, r: RespuestaFinal): ProgresoFinal {
  if (r.final) return r.final;
  return calcularProgreso(p.n, p.requeridas, p.aciertos + (r.correcta ? 1 : 0), p.fallos + (r.correcta ? 0 : 1));
}

/** Encuentro al que pertenece la pregunta `idx`. */
export function encuentroDe(encuentros: Encuentro[], idx: number): { indice: number; encuentro: Encuentro } {
  for (let i = 0; i < encuentros.length; i++) {
    const e = encuentros[i];
    if (idx >= e.desde && idx < e.desde + e.cuantas) return { indice: i, encuentro: e };
  }
  const ultimo = encuentros.length - 1;
  return { indice: ultimo, encuentro: encuentros[ultimo] };
}

export function enFuria(encuentros: Encuentro[], idx: number): boolean {
  const { encuentro } = encuentroDe(encuentros, idx);
  return encuentro.tipo === "jefe" && encuentro.fase2_desde !== undefined && idx >= encuentro.fase2_desde;
}

/** ¿Se puede usar el motor? Necesita canvas 2D o WebGL. */
export function hayCanvas(doc: Document = document): boolean {
  try {
    const c = doc.createElement("canvas");
    return !!(c.getContext && (c.getContext("webgl") || c.getContext("2d")));
  } catch {
    return false;
  }
}

/** Escala entera y tamaño lógico del canvas para un ancho disponible en px CSS. */
export const ALTO_LOGICO = 150;
export function medidas(anchoCss: number, altoMaxCss = Infinity): { zoom: number; ancho: number; alto: number } {
  const ancho = Math.max(240, Math.floor(anchoCss));
  let zoom = Math.max(1, Math.min(5, Math.floor(ancho / 160)));
  while (zoom > 1 && ALTO_LOGICO * zoom > altoMaxCss) zoom--;
  return { zoom, ancho: Math.floor(ancho / zoom), alto: ALTO_LOGICO };
}
