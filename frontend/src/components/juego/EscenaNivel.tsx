/**
 * La pregunta como escena: fondo del bioma (src/escenas), el ANFITRIÓN a la izquierda con un globo que
 * "escribe" el enunciado, y el HÉROE del jugador con su MASCOTA a la derecha. Todos reaccionan.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { EstadoMascota } from "../../api";
import { spriteHeroe, spriteMascota, type Anim, type FichaPersonaje } from "../../arte";
import { Escena, type Bioma } from "../../escenas";
import { menosMovimiento, tocar } from "../../efectos";
import { Comida } from "../Iconos";
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
}

export function EscenaNivel({ bioma, anfitrion, reaccion, enunciado, idEnunciado, comentario, tier, mascota, gestoMascota = "quieta", herido, extra, alRegistrarSaltar }: Props) {
  const { n, saltar, escribiendo } = useTecleo(enunciado);
  const enfoque = useRef<HTMLDivElement>(null);
  useEffect(() => { alRegistrarSaltar?.(saltar); }, [saltar, alRegistrarSaltar]);
  useEffect(() => { enfoque.current?.focus(); }, [enunciado]);

  const animAnf: Anim = reaccion === "acierto" || reaccion === "festejo" ? "feliz" : reaccion === "error" ? "triste" : escribiendo ? "hablar" : "idle";
  const animHeroe: Anim = reaccion === "acierto" || reaccion === "festejo" ? "feliz" : herido ? "herido" : "idle";
  const animMascota: Anim = !mascota ? "idle" : !mascota.viva ? "triste" : mascota.hambrienta ? "triste" : reaccion === "acierto" ? "feliz" : "idle";
  const intensidad = menosMovimiento() ? 0 : 0.6;

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

        <div className="jg-actores">
          <div className={`jg-actor jg-anfitrion jg-gesto-${reaccion}`}>
            {comentario && <div className="jg-bocadillo" key={comentario}>{comentario}</div>}
            {reaccion === "error" && <span className="jg-gota" aria-hidden="true" />}
            {(reaccion === "acierto" || reaccion === "festejo") && <span className="jg-destellos" aria-hidden="true"><i /><i /><i /></span>}
            <Personaje nombre={anfitrion.id} rol="anfitrion" anim={animAnf} escala={3} alt={`${anfitrion.nombre}, anfitrión del nivel`} />
            <span className="jg-sombra" aria-hidden="true" />
          </div>

          <div className="jg-equipo">
            <div className={`jg-actor jg-heroe ${reaccion === "acierto" || reaccion === "festejo" ? "jg-salta" : ""} ${herido ? "jg-herido" : ""}`}>
              <Personaje nombre={spriteHeroe(tier)} rol="heroe" anim={animHeroe} escala={3} alt="Tu héroe" />
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
