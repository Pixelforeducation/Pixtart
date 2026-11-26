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
import { HeroeEquipado, tipoAtaque } from "./HeroeEquipado";
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
      <div className="jg-escenario">
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

/** Capa de efectos del ataque del héroe según su arma (CSS puro, ver juego.css «Ataques»). */
function EfectoAtaque({ tipo }: { tipo: ReturnType<typeof tipoAtaque> }) {
  return (
    <span className={`jg-fx jg-fx-${tipo}`} aria-hidden="true">
      {(tipo === "flecha" || tipo === "orbe") && <span className="jg-fx-proyectil" />}
      {tipo === "tajo" && <span className="jg-fx-tajo" />}
      {tipo === "triple" && <><span className="jg-fx-tajo" /><span className="jg-fx-tajo" /><span className="jg-fx-tajo" /></>}
      <span className="jg-fx-impacto"><i /><i /><i /><i /></span>
    </span>
  );
}
