/**
 * La pregunta como escena: fondo del bioma (src/escenas), el ANFITRIÓN a la izquierda con un globo que
 * "escribe" el enunciado, y el HÉROE del jugador con su MASCOTA a la derecha. Todos reaccionan.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Equipo, EstadoMascota } from "../../api";
import { spriteMascota, type Anim, type FichaPersonaje } from "../../arte";
import { Escena, useIntensidad, type Bioma } from "../../escenas";
import { menosMovimiento, tocar } from "../../efectos";
import { Comida } from "../Iconos";
import { HeroeEquipado, Pixeles, dibujoPx, tipoAtaque, type Px, type TipoAtaque } from "./HeroeEquipado";
import { Personaje } from "./Personaje";

export type Reaccion = "pregunta" | "acierto" | "error" | "festejo";
export type GestoMascota = "quieta" | "olfatea" | "niega";

/** Efecto máquina de escribir. Devuelve cuántos caracteres mostrar y cómo saltarlo. */
export function useTecleo(texto: string) {
  const [n, setN] = useState(() => (menosMovimiento() ? texto.length : 0));
  useEffect(() => {
    if (menosMovimiento()) { setN(texto.length); return; }
    setN(0);
    // Nunca más de ~1.2 s en total: el globo acompaña, no hace esperar.
    const porCar = Math.max(8, Math.min(30, 1200 / Math.max(1, texto.length)));
    const salto = porCar < 12 ? 2 : 1;
    const id = setInterval(() => {
      setN((x) => {
        const y = Math.min(texto.length, x + salto);
        if (y >= texto.length) clearInterval(id);
        return y;
      });
    }, porCar * salto);
    return () => clearInterval(id);
  }, [texto]);
  // Blip de "voz" del anfitrión mientras escribe (muy bajito, cada pocos caracteres).
  const ultimoBlip = useRef(0);
  useEffect(() => {
    if (n < ultimoBlip.current) ultimoBlip.current = 0;
    if (n > 0 && n < texto.length && n - ultimoBlip.current >= 5) { ultimoBlip.current = n; tocar("voz"); }
  }, [n, texto.length]);
  const saltar = useCallback(() => setN(texto.length), [texto]);
  return { n, saltar, escribiendo: n < texto.length };
}

interface Props {
  bioma: Bioma;
  anfitrion: FichaPersonaje;
  reaccion: Reaccion;
  enunciado: string;
  idEnunciado: string;
  /** Frase corta del anfitrión tras responder. */
  comentario?: string | null;
  tier: number;
  mascota: EstadoMascota | null;
  gestoMascota?: GestoMascota;
  /** El héroe recibió daño (perdió una vida) en la última respuesta. */
  herido?: boolean;
  /** Contenido extra sobre la escena (p. ej. "¡Rápido!"). */
  extra?: ReactNode;
  /** Se llama con la función para saltar el tecleo (para atajos de teclado). */
  alRegistrarSaltar?: (f: () => void) => void;
  /** Equipo del héroe (v0.3): se dibuja y el arma decide la animación de ataque. */
  equipo?: Equipo | null;
}

/** Quién ataca tras responder: el héroe si acertó, el anfitrión si falló (null = nadie / animaciones apagadas). */
export function atacante(reaccion: Reaccion, intensidad: number): "heroe" | "anfitrion" | null {
  if (intensidad <= 0) return null;
  return reaccion === "acierto" ? "heroe" : reaccion === "error" ? "anfitrion" : null;
}

export function EscenaNivel({ bioma, anfitrion, reaccion, enunciado, idEnunciado, comentario, tier, mascota, gestoMascota = "quieta", herido, extra, alRegistrarSaltar, equipo }: Props) {
  const { n, saltar, escribiendo } = useTecleo(enunciado);
  const enfoque = useRef<HTMLDivElement>(null);
  useEffect(() => { alRegistrarSaltar?.(saltar); }, [saltar, alRegistrarSaltar]);
  useEffect(() => { enfoque.current?.focus(); }, [enunciado]);

  const animAnf: Anim = reaccion === "acierto" || reaccion === "festejo" ? "feliz" : reaccion === "error" ? "triste" : escribiendo ? "hablar" : "idle";
  const animHeroe = reaccion === "acierto" || reaccion === "festejo" ? "feliz" : "idle";
  const animMascota: Anim = !mascota ? "idle" : !mascota.viva ? "triste" : mascota.hambrienta ? "triste" : reaccion === "acierto" ? "feliz" : "idle";
  const intensidad = menosMovimiento() ? 0 : 0.6;
  // Ataques: respetan prefers-reduced-motion y el ajuste de intensidad (completa 1, suave 0.5, apagada 0).
  const intAtaque = useIntensidad(1);
  const quien = atacante(reaccion, intAtaque);
  const arma = tipoAtaque(equipo?.arma);
  useEffect(() => {
    if (quien !== "heroe") return;
    const t = setTimeout(() => tocar(arma === "martillazo" ? "sacudida" : "whoosh"), 60);
    return () => clearTimeout(t);
  }, [quien, arma]);
  const claseAtaque = quien ? `jg-ataque-${quien} jg-arma-${arma}` : "";
  const estiloAtaque = { "--jg-int": intAtaque } as CSSProperties;

  return (
    <Escena bioma={bioma} intensidad={intensidad} className={`jg-escena jg-reac-${reaccion}`}>
      <div className={`jg-escenario ${quien === "heroe" && arma === "martillazo" ? "jg-sacudida-martillo" : ""}`}>
        <div className="jg-globo" ref={enfoque} tabIndex={-1} onClick={saltar}>
          <span className="jg-globo-nombre">{anfitrion.nombre}</span>
          <p className="jg-enunciado">
            <span id={idEnunciado} className="sr-only">{enunciado}</span>
            <span className="jg-tecleo" aria-hidden="true" data-t={enunciado.slice(0, n)} data-r={enunciado.slice(n)} />
          </p>
          {escribiendo && (
            <button type="button" className="jg-saltar" onClick={(e) => { e.stopPropagation(); saltar(); }}>
              Saltar <span aria-hidden="true">▸▸</span>
            </button>
          )}
        </div>

        <div className={`jg-actores ${claseAtaque}`} style={estiloAtaque} data-ataque={quien ?? "ninguno"} data-arma={arma}>
          {quien === "heroe" && <EfectoAtaque tipo={arma} />}
          <div className={`jg-actor jg-anfitrion jg-gesto-${reaccion}`}>
            {comentario && <div className="jg-bocadillo" key={comentario}>{comentario}</div>}
            {reaccion === "error" && <span className="jg-gota" aria-hidden="true" />}
            {(reaccion === "acierto" || reaccion === "festejo") && <span className="jg-destellos" aria-hidden="true"><i /><i /><i /></span>}
            <Personaje nombre={anfitrion.id} rol="anfitrion" anim={animAnf} escala={3} alt={`${anfitrion.nombre}, anfitrión del nivel`} />
            <span className="jg-sombra" aria-hidden="true" />
          </div>

          <div className="jg-equipo">
            <div className={`jg-actor jg-heroe ${reaccion === "acierto" || reaccion === "festejo" ? "jg-salta" : ""} ${herido ? "jg-herido" : ""}`}>
              <div className="jg-heroe-cuerpo">
                <span className="jg-heroe-espejo">
                  <HeroeEquipado tier={tier} equipo={equipo} anim={animHeroe} escala={3} alt="Tu héroe" className="jg-heroe-sprite" />
                </span>
              </div>
              <span className="jg-sombra" aria-hidden="true" />
            </div>
            {mascota && (
              <div className={`jg-actor jg-mascota-actor ${!mascota.viva ? "jg-muerta" : ""} ${mascota.viva && mascota.hambrienta ? "jg-hambre" : ""} jg-gesto-mascota-${gestoMascota}`}
                data-testid="mascota-escena">
                {gestoMascota === "olfatea" && <span className="jg-olfato" aria-hidden="true"><i /><i /><i /></span>}
                {!mascota.viva && <span className="jg-zzz" aria-hidden="true"><i>z</i><i>z</i><i>Z</i></span>}
                {mascota.viva && mascota.hambrienta && (
                  <span className="jg-pensamiento" aria-hidden="true"><Comida tam={16} /></span>
                )}
                <Personaje nombre={spriteMascota(mascota.especie)} rol="mascota" anim={animMascota} escala={2}
                  alt={!mascota.viva ? "Tu mascota descansa" : mascota.hambrienta ? "Tu mascota tiene hambre" : "Tu mascota"} />
                <span className="jg-sombra" aria-hidden="true" />
              </div>
            )}
          </div>
        </div>
        {extra}
      </div>
    </Escena>
  );
}

// ---- Efectos de ataque en pixel art (CSS en juego.css «Ataques»). Todos miran a la izquierda (al anfitrión). ----

const FX_COL = { W: "#FFFFFF", L: "#D6E6FF", S: "#A3A3AE", B: "#D9A066", R: "#E04848", Y: "#FFE27A", G: "#F2C230",
  C: "#C69CFF", V: "#8A5AE8", P: "#6B3FD6", F: "#F0C08A", f: "#C8905A", D: "#D8D0B8", d: "#A39A80", c: "#9FE7FF" };

const FLECHA: readonly string[] = [
  "..W............RR.RR",
  ".WS...........RR.RR.",
  "WSSBBBBBBBBBBBBBBBBB",
  ".WS...........RR.RR.",
  "..W............RR.RR",
];
const ORBE: readonly string[] = [
  "...PPPPP...",
  "..PCCCCCP..",
  ".PCWWCCCVP.",
  "PCWWCCCCVVP",
  "PCWCCCCCVVP",
  "PCCCCCCVVVP",
  "PCCCCCVVVVP",
  "PVCCCVVVVVP",
  ".PVVVVVVVP.",
  "..PVVVVVP..",
  "...PPPPP...",
];
const PUNIO: readonly string[] = [
  "..FFFFFF...",
  ".FWFFFFFFRR",
  "FFFFFFFFFRR",
  "FfFfFfFFFRR",
  "FFFFFFFFFRR",
  ".FFFFFFFfRR",
  "..ffffff...",
];
const DESTELLO: readonly string[] = ["...Y...", "...Y...", "..YWY..", "YYWWWYY", "..YWY..", "...Y...", "...Y..."];
const POLVO: readonly string[] = [".DDD..", "DDDDD.", "DDdDDD", ".ddddd"];

/** Media luna del tajo de espada (abre hacia la izquierda, gruesa al centro y fina en las puntas). */
function mediaLuna(): string[] {
  const R = 13, filas: string[] = [];
  for (let y = 0; y <= 2 * R; y++) {
    let f = "";
    for (let x = 0; x <= 2 * R; x++) {
      const dx = x - R, dy = y - R, d = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, -dx); // 0 = hacia la izquierda
      const grosor = 4.2 * Math.cos(ang) - 0.6;
      f += Math.abs(ang) < 1.45 && d <= R + 0.4 && d >= R + 0.4 - grosor ? (d >= R - 1 ? "W" : "c") : ".";
    }
    filas.push(f);
  }
  return filas;
}
/** Tajo recto de katana: diagonal "\" o "/" o línea horizontal. */
function corte(tipo: "\\" | "/" | "-"): string[] {
  const N = 26, filas: string[] = [];
  for (let y = 0; y < N; y++) {
    let f = "";
    for (let x = 0; x < N; x++) {
      const i = tipo === "/" ? N - 1 - x : x;
      const enLinea = tipo === "-" ? y === 12 || (y === 13 && x > 3 && x < N - 4) : (y === i || y === i + 1) && i > 1 && i < N - 2;
      f += enLinea ? (tipo === "-" ? (y === 12 ? "W" : "c") : y === i ? "W" : "c") : ".";
    }
    filas.push(f);
  }
  return filas;
}

const SPRITES_FX = (() => {
  const px = (f: readonly string[], borde: string | null = "#1B1F3B") => dibujoPx(f, FX_COL, borde);
  return {
    flecha: { px: px(FLECHA), vb: "0 0 22 7" },
    orbe: { px: px(ORBE, "#2B1460"), vb: "0 0 13 13" },
    punio: { px: px(PUNIO), vb: "0 0 13 9" },
    destello: { px: px(DESTELLO, null), vb: "1 1 7 7" },
    polvo: { px: px(POLVO, "#5C4A2E"), vb: "0 0 8 6" },
    luna: { px: px(mediaLuna(), "#3F7FE0"), vb: "0 0 29 29" },
    corteA: { px: px(corte("\\"), "#3F7FE0"), vb: "0 0 28 28" },
    corteB: { px: px(corte("/"), "#3F7FE0"), vb: "0 0 28 28" },
    corteC: { px: px(corte("-"), "#3F7FE0"), vb: "0 0 28 28" },
  } satisfies Record<string, { px: Px[]; vb: string }>;
})();

function Fx({ s, className }: { s: keyof typeof SPRITES_FX; className: string }) {
  return <Pixeles px={SPRITES_FX[s].px} viewBox={SPRITES_FX[s].vb} className={className} />;
}

/** Capa de efectos del ataque del héroe según su arma. */
export function EfectoAtaque({ tipo }: { tipo: TipoAtaque }) {
  return (
    <span className={`jg-fx jg-fx-${tipo}`} aria-hidden="true" data-fx={tipo}>
      {tipo === "punio" && <><Fx s="punio" className="jg-fx-puno" /><span className="jg-fx-onda" /><span className="jg-fx-onda jg-fx-onda2" /></>}
      {tipo === "tajo" && <Fx s="luna" className="jg-fx-tajo" />}
      {tipo === "flecha" && <Fx s="flecha" className="jg-fx-proyectil" />}
      {tipo === "orbe" && <>
        <Fx s="orbe" className="jg-fx-proyectil" />
        <Fx s="destello" className="jg-fx-chispa jg-fx-chispa1" /><Fx s="destello" className="jg-fx-chispa jg-fx-chispa2" /><Fx s="destello" className="jg-fx-chispa jg-fx-chispa3" />
      </>}
      {tipo === "martillazo" && <>
        <Fx s="polvo" className="jg-fx-polvo jg-fx-polvo1" /><Fx s="polvo" className="jg-fx-polvo jg-fx-polvo2" />
        <Fx s="polvo" className="jg-fx-polvo jg-fx-polvo3" /><Fx s="polvo" className="jg-fx-polvo jg-fx-polvo4" />
        <span className="jg-fx-grieta" />
      </>}
      {tipo === "triple" && <>
        <Fx s="corteA" className="jg-fx-corte jg-fx-corte1" /><Fx s="corteB" className="jg-fx-corte jg-fx-corte2" /><Fx s="corteC" className="jg-fx-corte jg-fx-corte3" />
        <Fx s="destello" className="jg-fx-chispa jg-fx-chispa1" /><Fx s="destello" className="jg-fx-chispa jg-fx-chispa2" /><Fx s="destello" className="jg-fx-chispa jg-fx-chispa3" />
      </>}
      <span className="jg-fx-impacto"><i /><i /><i /><i /></span>
    </span>
  );
}
