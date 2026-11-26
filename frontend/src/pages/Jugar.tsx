import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Ayuda, CofreAbierto, EstadoMascota, FinIntento, IntentoIniciado, PreguntaJugable, ProgresoReanudado, RespuestaPregunta, ResultadoRespuesta, TipoPregunta } from "../api";
import { useApi, useEstadoJuego } from "../contexto";
import { ANFITRIONES, type FichaPersonaje } from "../arte";
import type { Bioma } from "../escenas";
import { Corazones } from "../components/Corazones";
import { ABIERTAS, PreguntaVista, esEscritura } from "../components/Pregunta";
import { Temporizador } from "../components/Temporizador";
import { EscenaNivel, type GestoMascota, type Reaccion } from "../components/juego/EscenaNivel";
import { MascotaPanel } from "../components/juego/MascotaPanel";
import { BotonSonido, Combo, ContadorXp, Progreso, type Marca } from "../components/juego/Hud";
import { Cortinilla, type EstadoCortina } from "../components/juego/Cortinilla";
import { FinNivel } from "../components/juego/FinNivel";
import { CapaParticulas, alAzar, esCasi, momentos, pausa, siguienteRacha, tocar, useContador, useEfectos } from "../efectos";
import { mensajeError } from "../lib/validacion";
import { musica } from "../escenas/musica";
import "../components/juego/juego.css";

/** ¿Puede ayudar la mascota en este tipo de pregunta? (PLAN: común solo MC/VF; rara además completar/numérica/ordenar; legendaria todo). */
export function ayudaPermitida(m: EstadoMascota | null, tipo: TipoPregunta): boolean {
  if (!m || !m.viva) return false;
  if (tipo === "multiple_choice" || tipo === "true_false") return true;
  if (m.rareza === "comun") return false;
  if (ABIERTAS.includes(tipo)) return m.rareza === "legendaria";
  return true;
}

function textoRespuesta(r: RespuestaPregunta, opciones?: string[] | null, tipo?: TipoPregunta): string {
  if (tipo === "multiple_choice" && typeof r === "number") return opciones?.[r] ?? String(r);
  if (typeof r === "boolean") return r ? "Verdadero" : "Falso";
  if (tipo === "ordering" && Array.isArray(r)) return (r as number[]).map((i) => opciones?.[i] ?? i).join(" → ");
  if (Array.isArray(r)) return r.join(" / ");
  return String(r);
}

// ---- Elenco del nivel ----
const ANFITRIONES_RESERVA: FichaPersonaje[] = [
  { id: "anfitrion/buho-bibliotecario", nombre: "Búho bibliotecario", rol: "anfitrion" },
  { id: "anfitrion/mago", nombre: "Mago", rol: "anfitrion" },
  { id: "anfitrion/alquimista", nombre: "Alquimista", rol: "anfitrion" },
];
function hash(s: string): number {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
/** Anfitrión estable por nivel (mismo nivel, mismo anfitrión). Nunca enemigos: esos son del nivel final. */
export function elegirAnfitrion(nivelId: string): FichaPersonaje {
  const lista = ANFITRIONES.filter((a) => a.rol === "anfitrion");
  const l = lista.length ? lista : ANFITRIONES_RESERVA;
  return l[hash(nivelId) % l.length];
}
export function biomaPara(f: FichaPersonaje, nivelId: string): Bioma {
  const id = f.id.toLowerCase();
  if (/buho|owl|biblio|libro|book|tinta|ink/.test(id)) return "biblioteca";
  if (/mag|astr|bard/.test(id)) return "noche";
  if (/alqu|alch|golem|robot/.test(id)) return "cueva";
  return (["pradera", "bosque"] as const)[hash(nivelId) % 2];
}

const BIEN = ["¡Así se hace!", "¡Exacto!", "¡Brillante!", "¡Lo tienes!", "¡Bien pensado!", "¡Correctísimo!"];
const RACHA = ["¡Imparable!", "¡Qué racha!", "¡Estás en llamas!", "¡Sigue así!"];
const MAL = ["Mira la correcta: así se aprende.", "Tranquilo, de los errores se aprende.", "Buen intento, sigamos.", "¡Ánimo! La próxima es tuya."];
const CASI = ["¡Casi! Estuviste muy cerca.", "¡Uf, por poquito!", "¡Casi casi! Ya casi la tienes."];
const TIEMPO = "¡Se acabó el tiempo! No pasa nada.";

/** Estado reconstruido al retomar una partida pausada (v0.3): primera sin responder, marcas, aciertos y XP. */
export function restaurarProgreso(preguntas: PreguntaJugable[], prog: ProgresoReanudado) {
  const porId = new Map(prog.respondidas.map((x) => [String(x.pregunta_id), x]));
  const marcas: Marca[] = preguntas.map((q) => {
    const x = porId.get(String(q.id));
    return x ? (x.correcta ? "bien" : "mal") : null;
  });
  const primera = marcas.findIndex((m) => m === null);
  return {
    marcas,
    idx: primera === -1 ? Math.max(0, preguntas.length - 1) : primera,
    completo: primera === -1,
    aciertos: prog.respondidas.filter((x) => x.correcta).length,
    xp: prog.xp_ganada,
    restante: Math.max(0, prog.restante_s),
  };
}

export function Jugar() {
  const api = useApi();
  const nav = useNavigate();
  const { nivelId = "" } = useParams();
  const [params] = useSearchParams();
  const cursoId = params.get("curso");
  const { estado, refrescar } = useEstadoJuego();

  const [intento, setIntento] = useState<IntentoIniciado | null>(null);
  const [idx, setIdx] = useState(0);
  const [resultado, setResultado] = useState<ResultadoRespuesta | null>(null);
  const [ayudas, setAyudas] = useState<Ayuda[]>([]);
  const [vidas, setVidas] = useState<number>(estado?.vidas ?? 10);
  const [mascota, setMascota] = useState<EstadoMascota | null>(estado?.mascota ?? null);
  const [xp, setXp] = useState(0);
  const [fin, setFin] = useState<FinIntento | null>(null);
  const [cofre, setCofre] = useState<CofreAbierto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [calentamiento, setCalentamiento] = useState(false);
  // Sensación de juego
  const [racha, setRacha] = useState(0);
  const [mejorRacha, setMejorRacha] = useState(0);
  const [casi, setCasi] = useState(false);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [aciertos, setAciertos] = useState(0);
  const [reaccion, setReaccion] = useState<Reaccion>("pregunta");
  const [comentario, setComentario] = useState<string | null>(null);
  const [herido, setHerido] = useState(false);
  const [rapido, setRapido] = useState(false);
  const [gesto, setGesto] = useState<GestoMascota>("quieta");
  const [avisoMascota, setAvisoMascota] = useState<string | null>(null);
  const [ayudando, setAyudando] = useState(false);
  const [golpeXp, setGolpeXp] = useState(0);
  const [sacudir, setSacudir] = useState(false);
  const [cortina, setCortina] = useState<EstadoCortina>("descubrir");
  // v0.3
  const [ronda, setRonda] = useState(0); // sube al pulsar «Reintentar nivel»
  const [reanudo, setReanudo] = useState<{ idx: number; restante: number } | null>(null);
  const [avisoInicio, setAvisoInicio] = useState<string | null>(null);
  const [evoluciono, setEvoluciono] = useState<number | null>(null);
  /** Intento sin terminar: se pausa al salir (desmontar o cambiar de nivel). */
  const pendiente = useRef<IntentoIniciado["intento_id"] | null>(null);

  const inicio = useRef(Date.now());
  const siguienteBtn = useRef<HTMLButtonElement>(null);
  const zona = useRef<HTMLDivElement>(null);
  const xpRef = useRef<HTMLSpanElement>(null);
  const saltarTecleo = useRef<() => void>(() => {});
  const xpMostrada = useContador(xp, { retraso: 650, duracion: 500 });
  const [xpAntes, setXpAntes] = useState<number | null>(null);
  useEfectos(); // despierta el audio en el primer toque

  const anfitrion = elegirAnfitrion(nivelId);
  const bioma = biomaPara(anfitrion, nivelId);
  const tier = Math.max(1, ...Object.values(estado?.tier_por_tema ?? {}));

  useEffect(() => {
    if (estado) { setVidas(estado.vidas); setMascota(estado.mascota); }
  }, [estado]);

  useEffect(() => {
    let vivo = true;
    setIntento(null); setIdx(0); setResultado(null); setAyudas([]); setFin(null); setCofre(null); setXp(0); setError(null);
    setRacha(0); setMejorRacha(0); setCasi(false); setAciertos(0); setReaccion("pregunta"); setComentario(null); setHerido(false); setGesto("quieta"); setAvisoMascota(null);
    setReanudo(null); setAvisoInicio(null); setEvoluciono(null); setXpAntes(null);
    setCortina((c) => (c === "cubrir" || c === "descubrir" ? "descubrir" : null));
    const t = setTimeout(() => vivo && setCortina(null), 800);
    api.iniciarNivel(nivelId).then((r) => {
      if (!vivo) return;
      pendiente.current = r.intento_id;
      setIntento(r); setMarcas(r.preguntas.map(() => null)); inicio.current = Date.now();
      if (r.reanudado && r.progreso) {
        const p = restaurarProgreso(r.preguntas, r.progreso);
        const q = r.preguntas[p.idx];
        setMarcas(p.marcas); setIdx(p.idx); setAciertos(p.aciertos); setXp(p.xp);
        setReanudo({ idx: p.idx, restante: p.restante });
        // El tiempo ya consumido cuenta para `tiempo_ms`.
        if (q) inicio.current = Date.now() - Math.max(0, q.tiempo_s - p.restante) * 1000;
        if (r.progreso.respondidas.length > 0 || (q && p.restante < q.tiempo_s - 1)) setAvisoInicio("Partida retomada");
        if (p.completo) {
          // Todo respondido pero sin cerrar: se cierra ya.
          api.terminar(r.intento_id).then((f) => {
            if (!vivo) return;
            pendiente.current = null;
            setFin(f);
            void refrescar();
          }).catch((e) => vivo && setError(mensajeError(e)));
        }
      }
    }).catch((e) => vivo && setError(mensajeError(e)));
    if (cursoId) {
      api.camino(cursoId).then((c) => {
        const n = c.secciones.flatMap((s) => s.niveles).find((x) => String(x.id) === nivelId);
        if (vivo) setCalentamiento(n?.tipo === "calentamiento");
      }).catch(() => {});
    }
    void refrescar();
    return () => {
      vivo = false; clearTimeout(t);
      // Mejora 2: salir a otra sección (o pulsar ✕) con la partida sin terminar la pausa en el servidor.
      if (pendiente.current !== null) { api.pausar(pendiente.current).catch(() => {}); pendiente.current = null; }
    };
  }, [api, nivelId, cursoId, refrescar, ronda]);

  // Música de fondo del nivel; al salir vuelve la del mapa.
  useEffect(() => {
    musica.reproducir("nivel");
    return () => musica.reproducir("mapa");
  }, []);

  useEffect(() => {
    if (!avisoInicio) return;
    const t = setTimeout(() => setAvisoInicio(null), 3500);
    return () => clearTimeout(t);
  }, [avisoInicio]);

  const pregunta = intento?.preguntas[idx];

  const celebrar = useCallback((res: ResultadoRespuesta, nuevaRacha: number, vidaPerdida: boolean) => {
    // Breve "hit-stop": la loseta se congela un instante antes de que estallen los efectos.
    setTimeout(() => {
      const desde = zona.current?.querySelector(".correcta") ?? zona.current?.querySelector(".jg-responder") ?? zona.current;
      if (res.correcta) {
        momentos.acierto({ desde, hacia: xpRef.current, racha: nuevaRacha, xp: res.xp_ganada, alLlegar: () => setGolpeXp((g) => g + 1) });
      } else {
        momentos.error({ el: zona.current, vidaPerdida });
        setSacudir(true);
        setTimeout(() => setSacudir(false), 450);
      }
    }, 90);
  }, []);

  const responder = useCallback(async (r: RespuestaPregunta | null) => {
    if (!intento || !pregunta || resultado || enviando) return;
    setEnviando(true);
    saltarTecleo.current();
    try {
      const tiempo = Date.now() - inicio.current;
      const res = await api.responder(intento.intento_id, { pregunta_id: pregunta.id, respuesta: r, tiempo_ms: tiempo });
      const vidaPerdida = res.vidas < vidas;
      const nuevaRacha = siguienteRacha(racha, res.correcta);
      const cerca = !res.correcta && esCasi(pregunta.tipo, r, res.respuesta_correcta, pregunta.tolerancia);
      setResultado(res);
      setVidas(res.vidas);
      setMascota(res.mascota);
      setXp((x) => x + res.xp_ganada);
      setRacha(nuevaRacha);
      setMejorRacha((m) => Math.max(m, nuevaRacha));
      setCasi(cerca);
      setMarcas((m) => m.map((x, i) => (i === idx ? (res.correcta ? "bien" : "mal") : x)));
      if (res.correcta) setAciertos((a) => a + 1);
      setReaccion(res.correcta ? "acierto" : "error");
      setHerido(vidaPerdida);
      setRapido(res.correcta && tiempo < pregunta.tiempo_s * 1000 * 0.35);
      setComentario(res.correcta ? alAzar(nuevaRacha >= 3 ? RACHA : BIEN) : r === null ? TIEMPO : alAzar(cerca ? CASI : MAL));
      if (res.mascota_evento?.evoluciono) {
        setEvoluciono(res.mascota_evento.etapa);
        setTimeout(() => tocar("subirNivel"), 700);
      }
      celebrar(res, nuevaRacha, vidaPerdida);
      setTimeout(() => siguienteBtn.current?.focus(), 0);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setEnviando(false);
    }
  }, [api, intento, pregunta, resultado, enviando, vidas, racha, idx, celebrar]);

  const pedirAyuda = useCallback(async () => {
    if (!intento || !pregunta || resultado || ayudando) return;
    if (!mascota || !mascota.viva) return;
    if (!ayudaPermitida(mascota, pregunta.tipo) || mascota.ayudas_restantes_nivel <= 0) {
      setGesto("niega");
      setAvisoMascota(mascota.ayudas_restantes_nivel <= 0 ? "Ya no le quedan ayudas en este nivel." : "No puede ayudar en este tipo de pregunta.");
      setTimeout(() => setGesto("quieta"), 700);
      return;
    }
    setAyudando(true);
    setAvisoMascota(null);
    setGesto("olfatea");
    tocar("ayuda");
    try {
      const [a] = await Promise.all([api.ayuda(intento.intento_id, pregunta.id), pausa(650)]);
      setAyudas((x) => [...x, a]);
      setMascota((m) => {
        if (!m) return m;
        const comida = Math.max(0, m.comida - 1);
        return { ...m, ayudas_restantes_nivel: Math.max(0, m.ayudas_restantes_nivel - 1), comida, hambrienta: m.hambrienta || comida === 0 };
      });
      setGesto("quieta");
    } catch (e) {
      setGesto("niega");
      setAvisoMascota(mensajeError(e));
      setTimeout(() => setGesto("quieta"), 700);
    } finally {
      setAyudando(false);
    }
  }, [api, intento, pregunta, resultado, ayudando, mascota]);

  // Atajos globales: H pide ayuda; cualquier número completa el globo del anfitrión.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || esEscritura(e.target)) return;
      if (e.key === "h" || e.key === "H") { e.preventDefault(); void pedirAyuda(); }
      else if (/^[1-9]$/.test(e.key)) saltarTecleo.current();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [pedirAyuda]);

  const siguiente = async () => {
    if (!intento) return;
    if (idx + 1 < intento.preguntas.length) {
      tocar("whoosh");
      setIdx(idx + 1); setResultado(null); setAyudas([]); setError(null); setCasi(false);
      setReaccion("pregunta"); setComentario(null); setHerido(false); setRapido(false); setAvisoMascota(null);
      setEvoluciono(null);
      inicio.current = Date.now();
      return;
    }
    try {
      setXpAntes(Math.max(0, ...Object.values(estado?.xp_total_por_tema ?? {})));
      tocar("whoosh");
      const f = await api.terminar(intento.intento_id);
      pendiente.current = null;
      setFin(f);
      void refrescar();
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  const siguienteNivel = async () => {
    if (!cursoId) return nav("/");
    setCortina("cubrir");
    tocar("whoosh");
    try {
      const [c] = await Promise.all([api.camino(cursoId), pausa(550)]);
      const nodos = c.secciones.flatMap((s) => s.niveles).filter((n) => n.tipo !== "cofre");
      const prox = nodos.find((n) => n.estado === "actual") ?? nodos.find((n) => n.estado === "disponible");
      if (prox) nav(`/jugar/${prox.id}?curso=${cursoId}`);
      else nav(`/?curso=${cursoId}`);
    } catch {
      nav(`/?curso=${cursoId}`);
    }
  };

  const abrirCofre = async () => {
    if (!fin?.cofre) return;
    try { setCofre(await api.abrirCofre(fin.cofre.id)); void refrescar(); } catch (e) { setError(mensajeError(e)); }
  };

  const reintentar = () => { tocar("whoosh"); setRonda((r) => r + 1); };

  const volver = cursoId ? `/?curso=${cursoId}` : "/";
  const capas = <><CapaParticulas /><Cortinilla estado={cortina} /></>;

  if (error && !intento) return <><p className="error" role="alert">{error}</p><Link to={volver} className="boton secundario">Volver al camino</Link></>;
  if (!intento) return <div className="jg-nivel">{capas}<p className="jg-cargando">Preparando el nivel…</p></div>;

  if (fin) {
    return (
      <div className="jg-nivel">
        {capas}
        <FinNivel fin={fin} cofre={cofre} onAbrirCofre={abrirCofre} onSiguiente={siguienteNivel} volver={volver} error={error}
          bioma={bioma} anfitrion={anfitrion} tier={tier} aciertos={aciertos} total={intento.preguntas.length}
          mejorRacha={mejorRacha} rachaDias={estado?.racha ?? 0} xpAntes={fin.aprobado === false ? null : xpAntes} onReintentar={reintentar} equipo={estado?.equipo ?? null} />
      </div>
    );
  }

  if (!pregunta) return <p>Este nivel no tiene preguntas. <Link to={volver}>Volver</Link></p>;
  const total = intento.preguntas.length;
  const ultima = idx + 1 >= total;
  // Al retomar, el reloj de esa pregunta arranca con lo que le quedaba.
  const segundos = reanudo && reanudo.idx === idx ? reanudo.restante : pregunta.tiempo_s;
  const evento = resultado?.mascota_evento ?? null;

  return (
    <div className={`jg-nivel ${sacudir ? "jg-sacude" : ""}`}>
      {capas}
      <header className="hud jg-hud" role="region" aria-label="Estado del nivel">
        <div className="jg-hud-fila">
          <Link to={volver} className="jg-salir" aria-label="Salir al camino">✕</Link>
          <Progreso marcas={marcas} actual={idx} />
          <span className="jg-hud-cuenta">{idx + 1}/{total}</span>
          <BotonSonido />
        </div>
        <div className="jg-hud-fila">
          <Corazones vidas={vidas} />
          <Combo racha={racha} />
          <ContadorXp ref={xpRef} valor={xpMostrada} golpe={golpeXp} />
        </div>
        <Temporizador segundos={segundos} total={pregunta.tiempo_s} activo={!resultado && !enviando} clave={pregunta.id} onAgotado={() => responder(null)}
          onSegundo={(seg) => tocar("tic", seg)} />
      </header>
      {calentamiento && <p className="aviso jg-aviso">Calentamiento: aquí los errores no cuestan vidas.</p>}
      {intento.reintento && <p className="aviso jg-aviso">Reintento: preguntas nuevas de la misma dificultad.</p>}
      {avisoInicio && <p className="aviso jg-aviso jg-aviso-retomada" role="status">{avisoInicio}</p>}

      <EscenaNivel key={`esc-${pregunta.id}`} bioma={bioma} anfitrion={anfitrion} reaccion={reaccion} enunciado={pregunta.enunciado}
        idEnunciado={`enun-${pregunta.id}`} comentario={comentario} tier={tier} mascota={mascota} gestoMascota={gesto} herido={herido}
        equipo={estado?.equipo ?? null}
        alRegistrarSaltar={(f) => { saltarTecleo.current = f; }}
        extra={rapido ? <div className="jg-rapido" aria-hidden="true">¡Rápido!</div> : null} />

      <MascotaPanel mascota={mascota} onAyuda={resultado ? undefined : pedirAyuda} ayudaPosible={ayudaPermitida(mascota, pregunta.tipo) && !ayudando}
        onRevive={refrescar} aviso={avisoMascota} />

      <div className="jg-zona" ref={zona} key={pregunta.id}>
        <PreguntaVista pregunta={pregunta} ayudas={ayudas} resultado={resultado} onResponder={responder} enviando={enviando} mostrarEnunciado={false} />
      </div>

      {resultado && (
        <div className={`feedback jg-feedback ${resultado.correcta ? "bien" : "mal"} ${casi ? "jg-casi" : ""}`} role="status" aria-live="polite">
          <div className="jg-fb-cabeza">
            <span className="jg-fb-icono" aria-hidden="true">{resultado.correcta ? "✓" : casi ? "~" : "✗"}</span>
            <h2>{resultado.correcta ? "¡Correcto!" : casi ? "¡Casi! Incorrecto" : "Incorrecto"}</h2>
          </div>
          <div className="jg-chips">
            {resultado.xp_ganada > 0 && <span className="jg-chip jg-chip-xp">+{resultado.xp_ganada} XP</span>}
            {rapido && <span className="jg-chip jg-chip-rapido">¡Rápido!</span>}
            {racha >= 2 && <span className="jg-chip jg-chip-racha">Racha {racha}</span>}
            {herido && <span className="jg-chip jg-chip-vida">−1 vida</span>}
            {evento && evento.xp_ganada > 0 && <span className="jg-chip jg-chip-mascota">+{evento.xp_ganada} XP mascota</span>}
            {!resultado.correcta && !herido && calentamiento && <span className="jg-chip">Sin costo: calentamiento</span>}
          </div>
          {evoluciono !== null && (
            <div className="jg-evoluciona" role="status">¡Tu mascota evolucionó!{evoluciono === 3 ? " Forma final" : ` Etapa ${evoluciono}`}</div>
          )}
          {!resultado.correcta && !ABIERTAS.includes(pregunta.tipo) && (
            <p className="jg-fb-correcta">La respuesta correcta es: <strong>{textoRespuesta(resultado.respuesta_correcta, pregunta.opciones, pregunta.tipo)}</strong></p>
          )}
          {ABIERTAS.includes(pregunta.tipo) && typeof resultado.respuesta_correcta === "string" && <p>Referencia: {resultado.respuesta_correcta}</p>}
          {resultado.explicacion && (
            <div className="jg-fb-explica">
              {!resultado.correcta && <span className="jg-fb-porque">¿Por qué?</span>}
              <p>{resultado.explicacion}</p>
            </div>
          )}
          <button ref={siguienteBtn} className="boton jg-continuar" onClick={siguiente}>
            {resultado.correcta ? (ultima ? "Terminar nivel" : "Siguiente") : ultima ? "Entendido · Terminar nivel" : "Entendido"}
            <span aria-hidden="true"> ▶</span>
          </button>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
