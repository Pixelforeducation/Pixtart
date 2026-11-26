/** Pantalla de recompensas: conteo de XP y monedas, drop con brillo por rareza, cofre y confeti. */
import { useEffect, useRef, useState } from "react";
import type { Equipo } from "../../api";
import { Link } from "react-router-dom";
import type { CofreAbierto, FinIntento, Rareza } from "../../api";
import { spriteHeroe, type FichaPersonaje } from "../../arte";
import { Escena, type Bioma } from "../../escenas";
import { alAzar, bonusRacha, centro, estrellasNivel, lanzar, menosMovimiento, momentos, tocar, useContador } from "../../efectos";
import { BarraXP, ModalSubeNivel, RachaLlama } from "../enganche";
import { Corazones } from "../Corazones";
import { Moneda } from "../Iconos";
import { Cofre } from "./Cofre";
import { ItemArte } from "./ItemArte";
import { Personaje } from "./Personaje";

const RAREZA: Record<Rareza, string> = { comun: "común", rara: "rara", legendaria: "legendaria" };
const FRASES_FIN = ["¡Gran trabajo!", "¡Eso fue genial!", "¡Aprendiste un montón!", "¡Nivel superado!"];
const FRASES_PERFECTO = ["¡Ni un error! ¡Increíble!", "¡Perfecto! Eres una leyenda.", "¡Impecable!"];

interface Props {
  fin: FinIntento;
  cofre: CofreAbierto | null;
  onAbrirCofre: () => Promise<void>;
  onSiguiente: () => void;
  volver: string;
  error: string | null;
  bioma: Bioma;
  anfitrion: FichaPersonaje;
  tier: number;
  aciertos: number;
  total: number;
  /** Mejor racha de aciertos seguidos en este nivel. */
  mejorRacha?: number;
  /** Racha diaria (días seguidos). */
  rachaDias?: number;
  /** XP del tema antes del nivel (para animar la barra de evolución). null = no se muestra. */
  xpAntes?: number | null;
  /** v0.3: vuelve a iniciar el mismo nivel (se ofrece si no se alcanzó el mínimo). */
  onReintentar?: () => void;
  equipo?: Equipo | null;
}

export function FinNivel({ fin, cofre, onAbrirCofre, onSiguiente, volver, error, bioma, anfitrion, tier, aciertos, total, mejorRacha = 0, rachaDias = 0, xpAntes = null, onReintentar, equipo = null }: Props) {
  const reprobado = fin.aprobado === false;
  const nEstrellas = estrellasNivel(aciertos, total, fin.perfecto);
  const [estrellasVistas, setEstrellasVistas] = useState(menosMovimiento() ? nEstrellas : 0);
  const [subio, setSubio] = useState<{ tier: number; antes: number } | null>(null);
  const xp = useContador(fin.xp_ganada, { retraso: 1500, duracion: 1100, alPaso: (v) => { if (v % 5 === 0) tocar("tic"); } });
  const [monedasObj, setMonedasObj] = useState(menosMovimiento() ? fin.monedas : 0);
  const monedas = useContador(monedasObj, { duracion: 500 });
  const [verDrop, setVerDrop] = useState(menosMovimiento());
  const [frase] = useState(() => alAzar(fin.perfecto ? FRASES_PERFECTO : FRASES_FIN));
  const ranura = useRef<HTMLSpanElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Arriba del todo para ver caer las estrellas; el foco va al título sin mover la vista.
    try { window.scrollTo(0, 0); } catch { /* jsdom */ }
    titulo.current?.focus({ preventScroll: true });
    if (reprobado) return; // sin celebración: no se pasó el nivel
    momentos.celebrar({ perfecto: fin.perfecto });
    const w = typeof window !== "undefined" ? window.innerWidth : 400;
    // Estrellas que caen una por una, cada una más aguda.
    const tEstrellas = Array.from({ length: nEstrellas }, (_, i) => setTimeout(() => {
      setEstrellasVistas(i + 1);
      tocar("estrella", i);
      const el = document.querySelectorAll(".jg-fin-estrella")[i];
      const c = centro(el);
      if (c) lanzar({ tipo: "chispa", desde: c, cantidad: 8 });
    }, 600 + i * 380));
    // Monedas que vuelan al contador una por una.
    const t1 = setTimeout(() => {
      const hacia = centro(ranura.current);
      const n = Math.min(12, Math.max(4, Math.round(fin.monedas / 5)));
      lanzar({
        tipo: "moneda", desde: { x: w / 2, y: (typeof window !== "undefined" ? window.innerHeight : 800) * 0.35 }, hacia, cantidad: n,
        alLlegar: (i, tot) => { tocar("moneda"); setMonedasObj(Math.round((fin.monedas * (i + 1)) / tot)); },
      });
    }, 1900);
    const t2 = setTimeout(() => { setVerDrop(true); if (fin.drop) tocar("combo", 3); }, 2700);
    return () => { clearTimeout(t1); clearTimeout(t2); tEstrellas.forEach(clearTimeout); };
  }, [fin]);

  if (reprobado) {
    const pct = fin.porcentaje ?? (total ? Math.round((100 * aciertos) / total) : 0);
    const min = fin.minimo ?? 60;
    return (
      <Escena bioma={bioma} intensidad={0} className="jg-escena jg-fin">
        <section className="jg-fin-panel jg-no-aprobado" aria-labelledby="fin-tit">
          <h1 id="fin-tit" ref={titulo} tabIndex={-1}>No alcanzaste el mínimo</h1>
          <p className="jg-fin-minimo">Lograste {pct}% de {min}% necesario ({aciertos} de {total} aciertos).</p>
          <div className="jg-fin-minimo-barra" role="img" aria-label={`${pct}% de ${min}% necesario`}>
            <span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
            <i style={{ left: `${Math.max(0, Math.min(100, min))}%` }} />
          </div>
          <div className="jg-fin-elenco" aria-hidden="true">
            <div className="jg-actor">
              <span className="jg-bocadillo">¡Tú puedes! Inténtalo otra vez.</span>
              <Personaje nombre={anfitrion.id} rol="anfitrion" anim="idle" escala={3} alt="" />
            </div>
            <div className="jg-actor">
              <Personaje nombre={spriteHeroe(tier)} rol="heroe" anim="idle" escala={3} alt="" equipo={equipo} />
            </div>
          </div>
          <p>El nivel no se completa todavía. Al reintentar verás preguntas nuevas de la misma dificultad.</p>
          <div className="jg-chips jg-fin-chips">
            {fin.xp_ganada > 0 && <span className="jg-chip jg-chip-xp">+{fin.xp_ganada} XP</span>}
            {fin.monedas > 0 && <span className="jg-chip">+{fin.monedas} monedas</span>}
          </div>
          <p className="jg-fin-vidas"><Corazones vidas={fin.vidas} /></p>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="jg-fin-acciones">
            {onReintentar && <button className="boton jg-grande" onClick={onReintentar}>Reintentar nivel ↻</button>}
            <Link to={volver} className="boton secundario">Volver al camino</Link>
          </div>
        </section>
      </Escena>
    );
  }

  return (
    <Escena bioma={bioma} intensidad={menosMovimiento() ? 0 : 0.6} className="jg-escena jg-fin">
      <section className="jg-fin-panel" aria-labelledby="fin-tit">
        {fin.perfecto && <div className="jg-sello" aria-hidden="true">¡Perfecto!</div>}
        <h1 id="fin-tit" ref={titulo} tabIndex={-1}>{fin.perfecto ? "¡Nivel perfecto!" : "¡Nivel completado!"}</h1>
        <div className="jg-fin-estrellas" role="img" aria-label={`${nEstrellas} de 3 estrellas`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={`jg-fin-estrella ${i < estrellasVistas ? "jg-ganada" : ""} ${i === 1 ? "jg-centro" : ""}`} aria-hidden="true" />
          ))}
        </div>
        <p className="jg-fin-sub">{aciertos} de {total} aciertos</p>

        <div className="jg-fin-elenco" aria-hidden="true">
          <div className="jg-actor jg-salta-loop">
            <span className="jg-bocadillo">{frase}</span>
            <Personaje nombre={anfitrion.id} rol="anfitrion" anim="feliz" escala={3} alt="" />
          </div>
          <div className="jg-actor jg-salta-loop jg-retraso">
            <Personaje nombre={spriteHeroe(tier)} rol="heroe" anim="feliz" escala={3} alt="" equipo={equipo} />
          </div>
        </div>

        <div className="jg-premios">
          <div className="jg-premio jg-premio-xp">
            <span className="jg-estrella grande" aria-hidden="true" />
            <span className="jg-premio-valor" aria-hidden="true">+{xp}</span>
            <span className="jg-premio-tag">XP</span>
          </div>
          <div className="jg-premio jg-premio-monedas">
            <span ref={ranura}><Moneda tam={28} /></span>
            <span className="jg-premio-valor" aria-hidden="true" key={monedas}>+{monedas}</span>
            <span className="jg-premio-tag">monedas</span>
          </div>
        </div>
        <div className="jg-chips jg-fin-chips">
          {fin.perfecto && <span className="jg-chip jg-chip-xp">Bonus perfecto +30 XP</span>}
          {mejorRacha >= 2 && <span className="jg-chip jg-chip-racha">Mejor racha {mejorRacha} · +{bonusRacha(mejorRacha)} XP</span>}
        </div>
        <p className="sr-only" role="status">Ganaste +{fin.xp_ganada} XP y +{fin.monedas} monedas.</p>
        {xpAntes !== null && (
          <div className="jg-fin-evolucion">
            <BarraXP xp={xpAntes + fin.xp_ganada} desde={xpAntes} retraso={1600} etiqueta="Tu evolución"
              onSubeNivel={(t, a) => setTimeout(() => setSubio({ tier: t, antes: a }), 500)} />
          </div>
        )}
        {rachaDias > 0 && <div className="jg-fin-racha"><RachaLlama dias={rachaDias} /></div>}
        <p className="jg-fin-vidas"><Corazones vidas={fin.vidas} /></p>

        {fin.drop && verDrop && (
          <div className={`jg-drop jg-r-${fin.drop.rareza}`} role="status">
            <span className="jg-drop-brillo" aria-hidden="true" />
            <ItemArte id={fin.drop.item_id} />
            <div>
              <div className="jg-drop-tit">¡Encontraste algo!</div>
              <strong>{fin.drop.nombre}</strong> <span className="jg-drop-rareza">({RAREZA[fin.drop.rareza]})</span>
            </div>
          </div>
        )}

        {fin.cofre && (
          <Cofre tipo={fin.cofre.tipo === "legendario" ? "legendario" : "normal"} contenido={cofre} onAbrir={onAbrirCofre} />
        )}

        {error && <p className="error" role="alert">{error}</p>}
        <div className="jg-fin-acciones">
          <button className="boton jg-latido jg-grande" onClick={onSiguiente}>Siguiente nivel ▶</button>
          <Link to={volver} className="boton secundario">Volver al camino</Link>
        </div>
      </section>
      {subio && <ModalSubeNivel tier={subio.tier} tierAnterior={subio.antes} onCerrar={() => setSubio(null)} />}
    </Escena>
  );
}
