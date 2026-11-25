/**
 * src/efectos — "jugo" del juego: sonido chiptune sintetizado, partículas, sacudidas, vibración,
 * textos flotantes y contadores que suben. Sin archivos externos ni dependencias.
 *
 * Regla de oro: TODO es opcional. Con `prefers-reduced-motion: reduce` no hay partículas, sacudidas,
 * vibración ni pausas dramáticas (los callbacks de las partículas se llaman al instante para que los
 * contadores cuadren). El sonido se silencia y se ajusta con persistencia en localStorage (try/catch).
 *
 * ── Uso rápido ──────────────────────────────────────────────────────────────────────────────────
 *   import { CapaParticulas, useEfectos } from "../efectos";
 *   // Monta UNA vez <CapaParticulas /> en la pantalla (canvas fijo, pointer-events: none).
 *   const ef = useEfectos();
 *   ef.acierto({ desde: botonEl, hacia: contadorXpEl, racha: 4, xp: 10 });
 *   ef.error({ vidaPerdida: true });
 *   ef.monedas({ desde, hacia, cantidad: 8, alLlegar: (i, n) => … });
 *   ef.celebrar({ perfecto: true });  ef.subirNivel();  ef.cofre({ desde, legendario: true });  ef.toque();
 *   ef.sonido → { activo, volumen, alternar(), ponerVolumen(0..1) }
 *
 * ── Piezas sueltas ──────────────────────────────────────────────────────────────────────────────
 *   tocar(sonido, nivel?)        "clic" | "boton" | "acierto"(nivel=racha, sube de tono) | "error" | "combo"
 *                                | "racha" | "moneda" | "xp" | "subirNivel" | "cofre" | "cofreLegendario"
 *                                | "fanfarria" | "perfecto" | "estrella"(nivel=0..2) | "tic"(nivel=seg)
 *                                | "ayuda" | "corazon" | "sacudida" | "whoosh" | "voz"
 *   ponerSonido(bool) · sonidoActivo() · ponerVolumen(0..1) · volumen() · useSonido() · useSonidoActivo()
 *   desbloquearAudio()           se llama solo; despierta el AudioContext en el primer toque/tecla.
 *   lanzar({ tipo, desde, hacia?, cantidad?, alLlegar? })   tipo: "xp" | "moneda" | "chispa" | "confeti"
 *                                | "humo" | "estrella". Con `hacia`, xp/moneda vuelan al punto.
 *   centro(el) → {x,y}           centro de un elemento en coordenadas de ventana.
 *   sacudir(el?, fuerza 0..3)    screen shake (Web Animations).
 *   vibrar("toque"|"acierto"|"error"|"racha"|"cofre"|"logro") · ponerVibracion(bool)
 *   flotarTexto({ texto, desde, hacia?, color?, tam? })      "+10 XP" que sube o vuela al contador.
 *   useContador(objetivo, { duracion, retraso, alPaso })      número que sube animado.
 *   pausa(ms) · menosMovimiento() · alAzar(lista)
 *   nivelCombo(racha) · siguienteRacha · esHitoRacha · bonusRacha · estrellasNivel · esCasi
 *   notasAcierto(racha) · frecuenciaTic(seg) · PENTA
 */
export { menosMovimiento, pausa, alAzar } from "./movimiento";
export {
  tocar, ponerSonido, sonidoActivo, ponerVolumen, volumen, useSonido, useSonidoActivo, desbloquearAudio,
  notasAcierto, frecuenciaTic, PENTA, type Sonido,
} from "./sonido";
export { CapaParticulas, lanzar, centro, type Rafaga, type Punto, type TipoParticula } from "./particulas";
export { sacudir, vibrar, ponerVibracion, vibracionActiva, flotarTexto, PATRONES, type Vibracion, type Flotante } from "./sensaciones";
export { nivelCombo, siguienteRacha, esHitoRacha, bonusRacha, estrellasNivel, esCasi } from "./combo";
export { useContador } from "./contador";
export { useEfectos, momentos, type Momentos } from "./useEfectos";
