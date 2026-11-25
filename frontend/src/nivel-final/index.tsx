/**
 * Nivel final (dueño: agente `nivel-final`). Ruta /final/:nivelId[?curso=<id>].
 *
 * Aventura 2D: el héroe avanza por el bioma; cada monstruo es una pregunta (o varias) con tiempo.
 * El mundo lo pinta Phaser 3 (`motor.ts`, cargado bajo demanda); el desafío es DOM accesible
 * (reutiliza `components/Pregunta`). Si no hay canvas o Phaser falla, se juega igual sin canvas.
 * `/final/demo` juega una demostración local sin backend.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { CofreAbierto, RespuestaPregunta } from "../api";
import { useApi } from "../contexto";
import { Corazones } from "../components/Corazones";
import { PreguntaVista } from "../components/Pregunta";
import { Sprite } from "../components/Sprite";
import { Temporizador } from "../components/Temporizador";
import { mensajeError } from "../lib/validacion";
import { guardarSonido, musica, sonidoGuardado, tocar, type Efecto } from "./audio";
import { crearApiDemo, type ApiFinal } from "./demo";
import {
  aplicarRespuesta,
  encuentroDe,
  enFuria,
  hayCanvas,
  infoDesde,
  type FinFinal,
  type InfoFinal,
  type IntentoFinal,
  type ProgresoFinal,
  type RespuestaFinal,
} from "./logica";
import { COFRE_LEGENDARIO, monstruoPara, sueloPara, type FichaMonstruo, type Suelo } from "./sprites";
import type { Vista } from "./motor";
import "./nivel-final.css";

type Fase = "cargando" | "intro" | "avanzando" | "desafio" | "resolviendo" | "feedback" | "victoria" | "terminando" | "fin" | "error";
type Modo = "canvas" | "sin-canvas";

interface Monstruo {
  ficha: FichaMonstruo;
  hp: number;
  hpMax: number;
  tipo: "comun" | "raro" | "jefe";
}

const TIPO_TXT = { comun: "común", raro: "raro", jefe: "jefe" } as const;

function reducido(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

function textoRespuesta(r: RespuestaPregunta, opciones?: string[] | null, tipo?: string): string {
  if (tipo === "multiple_choice" && typeof r === "number") return opciones?.[r] ?? String(r);
  if (typeof r === "boolean") return r ? "Verdadero" : "Falso";
  if (tipo === "ordering" && Array.isArray(r)) return (r as number[]).map((i) => opciones?.[i] ?? i).join(" → ");
  if (Array.isArray(r)) return r.join(" / ");
  return String(r);
}

export interface PropsNivelFinal {
  /** Para tests: fuerza el modo sin canvas o inyecta la API. */
  modoInicial?: Modo;
  api?: ApiFinal;
}

export default function NivelFinal({ modoInicial, api: apiProp }: PropsNivelFinal = {}) {
  const apiApp = useApi();
  const nav = useNavigate();
  const { nivelId = "demo" } = useParams(); // /final/demo no lleva parámetro
  const [params] = useSearchParams();
  const cursoId = params.get("curso");
  const demo = nivelId === "demo";
  const api: ApiFinal = useMemo(() => apiProp ?? (demo ? crearApiDemo() : apiApp), [apiProp, demo, apiApp]);
  const sinMovimiento = useMemo(reducido, []);

  const [modo, setModo] = useState<Modo>(() => modoInicial ?? (hayCanvas() ? "canvas" : "sin-canvas"));
  const [fase, setFase] = useState<Fase>("cargando");
  const [intento, setIntento] = useState<IntentoFinal | null>(null);
  const [info, setInfo] = useState<InfoFinal | null>(null);
  const [prog, setProg] = useState<ProgresoFinal | null>(null);
  const [idx, setIdx] = useState(0);
  const [monstruo, setMonstruo] = useState<Monstruo | null>(null);
  const [resultado, setResultado] = useState<RespuestaFinal | null>(null);
  const [fin, setFin] = useState<FinFinal | null>(null);
  const [cofre, setCofre] = useState<CofreAbierto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const [furia, setFuria] = useState(false);
  const [bonus, setBonus] = useState(false);
  const [salir, setSalir] = useState(false);
  const [sonido, setSonido] = useState(sonidoGuardado);
  const [motorListo, setMotorListo] = useState(false);
  const [seccion, setSeccion] = useState({ indice: 0, ultima: false });
  const [suelo, setSuelo] = useState<Suelo>("base");
  const [racha, setRacha] = useState(0);
  const [critico, setCritico] = useState(false);
  const [cofreAbriendo, setCofreAbriendo] = useState(false);

  const lienzo = useRef<HTMLDivElement>(null);
  const vistaRef = useRef<Vista | null>(null);
  const inicio = useRef(Date.now());
  const continuarBtn = useRef<HTMLButtonElement>(null);
  const sonidoRef = useRef(sonido);
  sonidoRef.current = sonido;
  const sfx = useCallback((e: Efecto) => tocar(e, sonidoRef.current), []);

  // ---- carga del intento (y de la sección para elegir jefe y bioma)
  const cargar = useCallback(() => {
    let vivo = true;
    setFase("cargando"); setIntento(null); setInfo(null); setProg(null); setIdx(0); setMonstruo(null);
    setResultado(null); setFin(null); setCofre(null); setError(null); setFuria(false); setBonus(false);
    setRacha(0); setCritico(false); setCofreAbriendo(false);
    api.iniciarNivel(nivelId).then((r) => {
      if (!vivo) return;
      const it = r as IntentoFinal;
      const inf = infoDesde(it);
      setIntento(it); setInfo(inf); setProg(inf); setFase("intro");
    }).catch((e) => { if (vivo) { setError(mensajeError(e)); setFase("error"); } });
    if (cursoId) {
      api.camino(cursoId).then((c) => {
        const i = c.secciones.findIndex((s) => s.niveles.some((n) => String(n.id) === nivelId));
        if (vivo && i >= 0) setSeccion({ indice: i, ultima: i === c.secciones.length - 1 });
      }).catch(() => {});
      const listar = (api as Partial<{ listarCursos: () => Promise<{ id: unknown; tema: string }[]> }>).listarCursos;
      listar?.().then((cs) => {
        const c = cs.find((x) => String(x.id) === cursoId);
        if (vivo && c) setSuelo(sueloPara(c.tema));
      }).catch(() => {});
    } else if (demo) {
      setSuelo("gris");
      setSeccion({ indice: 0, ultima: true });
    }
    return () => { vivo = false; };
  }, [api, nivelId, cursoId, demo]);

  useEffect(() => cargar(), [cargar]);

  // ---- motor Phaser (montaje/desmontaje; tolera el doble montaje de StrictMode)
  useEffect(() => {
    if (modo !== "canvas" || !intento || !lienzo.current) return;
    let vivo = true;
    let v: Vista | null = null;
    setMotorListo(false);
    const alto = Math.max(240, Math.floor(window.innerHeight * 0.45));
    import("./motor")
      .then(({ crearVista }) => crearVista(lienzo.current!, { suelo, reducido: sinMovimiento, altoMaxCss: alto }))
      .then((x) => {
        if (!vivo) { x.destruir(); return; }
        v = x; vistaRef.current = x; setMotorListo(true);
      })
      .catch(() => { if (vivo) setModo("sin-canvas"); });
    return () => {
      vivo = false;
      v?.destruir();
      vistaRef.current = null;
    };
  }, [modo, intento, suelo, sinMovimiento]);

  useEffect(() => {
    const el = lienzo.current;
    if (modo !== "canvas" || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => vistaRef.current?.redimensionar(el.clientWidth, Math.max(240, window.innerHeight * 0.45)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [modo, motorListo]);

  // ---- flujo
  const pregunta = intento?.preguntas[idx];

  const irA = useCallback(async (i: number, actual: Monstruo | null) => {
    if (!intento || !info) return;
    if (i >= intento.preguntas.length) return cerrarRef.current();
    setFase("avanzando");
    const { indice, encuentro } = encuentroDe(info.encuentros, i);
    let m = actual;
    if (i === encuentro.desde || !m) {
      await vistaRef.current?.caminar();
      const ficha = monstruoPara(encuentro.tipo, indice, seccion.indice, seccion.ultima);
      const hp = i === encuentro.desde ? encuentro.cuantas : encuentro.desde + encuentro.cuantas - i;
      m = { ficha, hp, hpMax: hp, tipo: encuentro.tipo };
      setMonstruo(m);
      if (encuentro.tipo === "jefe") sfx("jefe");
      setAnuncio(`Aparece ${encuentro.tipo === "jefe" ? "el jefe " : ""}${ficha.nombre} (${TIPO_TXT[encuentro.tipo]}, ${hp} ${hp === 1 ? "golpe" : "golpes"}).`);
      await vistaRef.current?.aparecer(ficha, hp);
    }
    if (enFuria(info.encuentros, i) && !furia) {
      setFuria(true);
      sfx("furia");
      setAnuncio("¡El jefe entra en furia! Las preguntas que quedan tienen menos tiempo.");
      await vistaRef.current?.furia();
    }
    setIdx(i); setResultado(null); setError(null);
    inicio.current = Date.now();
    setFase("desafio");
  }, [intento, info, seccion, furia, sfx]);

  const cerrar = useCallback(async () => {
    if (!intento) return;
    setFase("terminando");
    try {
      const f = (await api.terminar(intento.intento_id)) as FinFinal;
      setFin(f);
      setFase("fin");
    } catch (e) {
      setError(mensajeError(e));
      setFase("fin");
    }
  }, [api, intento]);
  const cerrarRef = useRef(cerrar);
  cerrarRef.current = cerrar;

  const responder = useCallback(async (r: RespuestaPregunta | null) => {
    if (!intento || !pregunta || !prog || fase !== "desafio") return;
    setFase("resolviendo");
    let res: RespuestaFinal;
    try {
      res = (await api.responder(intento.intento_id, { pregunta_id: pregunta.id, respuesta: r, tiempo_ms: Date.now() - inicio.current })) as RespuestaFinal;
    } catch (e) {
      setError(mensajeError(e));
      setFase("desafio");
      return;
    }
    const nuevo = aplicarRespuesta(prog, res);
    setProg(nuevo);
    setResultado(res);
    if (res.correcta && monstruo) {
      const hp = monstruo.hp - 1;
      const r2 = racha + 1;
      const crit = r2 >= 3;
      setRacha(r2); setCritico(crit);
      setMonstruo({ ...monstruo, hp });
      sfx(hp <= 0 ? "caida" : crit ? "critico" : "golpe");
      const pre = crit ? `¡Golpe crítico, racha de ${r2}!` : "¡Correcto!";
      setAnuncio(hp <= 0 ? `${pre} ${monstruo.ficha.nombre} cae.` : `${pre} A ${monstruo.ficha.nombre} le ${hp === 1 ? "queda 1 golpe" : `quedan ${hp} golpes`}.`);
      await vistaRef.current?.acierto(hp, crit);
      if (hp <= 0) setMonstruo(null);
    } else {
      setRacha(0); setCritico(false);
      sfx("herido");
      setAnuncio(r === null ? "Se acabó el tiempo. El monstruo te golpea." : `Incorrecto. El monstruo te golpea. Te quedan ${nuevo.corazones} corazones.`);
      await vistaRef.current?.fallo();
    }
    setFase("feedback");
    setTimeout(() => continuarBtn.current?.focus(), 0);
  }, [api, intento, pregunta, prog, fase, monstruo, racha, sfx]);

  const continuar = useCallback(async () => {
    if (!prog || !info || !intento) return;
    if (prog.resultado === "derrota") {
      sfx("derrota");
      await vistaRef.current?.derrota();
      return cerrar();
    }
    if (prog.resultado === "victoria" && !bonus) {
      if (monstruo && monstruo.hp > 0) {
        await vistaRef.current?.acierto(0); // el golpe que alcanza la meta tumba al monstruo
        setMonstruo(null);
      }
      sfx("victoria");
      setAnuncio("¡Meta alcanzada! Aprobaste el nivel final.");
      await vistaRef.current?.victoria();
      setFase("victoria");
      return;
    }
    const { encuentro } = encuentroDe(info.encuentros, idx);
    const sigue = idx + 1 < encuentro.desde + encuentro.cuantas;
    let actual = monstruo && monstruo.hp > 0 ? monstruo : null;
    if (!sigue && actual) {
      // Se acabaron sus preguntas y sigue en pie: se retira y el camino continúa.
      setAnuncio(`${actual.ficha.nombre} se retira.`);
      actual = null;
      setMonstruo(null);
    }
    void irA(idx + 1, sigue ? actual : null);
  }, [prog, info, intento, bonus, monstruo, idx, irA, cerrar, sfx]);

  const seguirBonus = () => { setBonus(true); void irA(idx + 1, null); };

  const abrirCofre = async () => {
    if (!fin?.cofre || cofreAbriendo) return;
    setCofreAbriendo(true);
    sfx("cofre");
    try {
      const [c] = await Promise.all([api.abrirCofre(fin.cofre.id), new Promise((r) => setTimeout(r, sinMovimiento ? 0 : 900))]);
      setCofre(c);
      sfx("victoria");
    } catch (e) { setError(mensajeError(e)); } finally { setCofreAbriendo(false); }
  };

  // Música chiptune: suena durante la aventura si el sonido está activo; en furia se acelera.
  const jugando = fase !== "cargando" && fase !== "error" && fase !== "fin" && fase !== "terminando";
  useEffect(() => { musica(sonido && jugando, furia); }, [sonido, jugando, furia]);
  useEffect(() => () => musica(false), []);

  const volver = () => nav(demo ? "/" : "/");

  // Escape abre el diálogo de salir; teclado completo para el resto vía botones.
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && fase !== "fin") setSalir((s) => !s); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [fase]);

  // ---- render
  if (fase === "error") {
    return (
      <div className="panel centro nf-error">
        <h1>Nivel final</h1>
        <p className="error" role="alert">{error}</p>
        <Link to="/" className="boton secundario">Volver al camino</Link>
      </div>
    );
  }

  const n = info?.n ?? 0;
  const p = prog;
  const enCombate = fase === "desafio" || fase === "resolviendo" || fase === "feedback" || fase === "avanzando";
  const aprobado = fin?.final?.aprobado ?? (p?.resultado === "victoria");

  return (
    <div className={`nf ${furia && enCombate ? "nf-furia" : ""}`} data-modo={modo}>
      <h1 className="sr-only">Nivel final{demo ? " (demostración)" : ""}</h1>
      <p className="sr-only" aria-live="polite">{anuncio}</p>

      <div className="nf-hud">
        <button type="button" className="boton chico peligro nf-salir" onClick={() => setSalir(true)} disabled={fase === "fin"} aria-label="Salir del nivel final">✕</button>
        <div className="nf-contador">
          <span className="nf-etq">Pregunta</span>
          <span>{p ? Math.min(n, idx + 1) : 0}/{n}</span>
        </div>
        {racha >= 2 && (
          <div key={racha} className={`nf-racha ${critico ? "crit" : ""}`} aria-label={`Racha de ${racha} aciertos`}>
            Racha ×{racha}
          </div>
        )}
        <div className="nf-corazones" aria-live="off">
          {p && (p.margen === 0
            ? <span className="nf-etq">Sin margen de error</span>
            : p.margen > 10
              ? <span className="nf-num" aria-label={`Corazones: ${p.corazones} de ${p.margen}`}>♥ {p.corazones}/{p.margen}</span>
              : <Corazones vidas={p.corazones} max={p.margen} />)}
        </div>
        <button type="button" className="boton chico secundario nf-sonido" aria-pressed={sonido}
          onClick={() => { const s = !sonido; setSonido(s); guardarSonido(s); if (s) tocar("golpe", true); }}>
          <span aria-hidden="true">{sonido ? "♪ Sí" : "♪ No"}</span><span className="sr-only">Sonido y música</span>
        </button>
      </div>

      {p && info && (
        <div className="nf-meta">
          <div className="nf-meta-txt">
            <span>{monstruo ? `${monstruo.tipo === "jefe" ? "Jefe: " : ""}${monstruo.ficha.nombre}` : "Camino al castillo"}</span>
            <span>Meta {info.g} %: {Math.min(p.aciertos, p.requeridas)}/{p.requeridas}</span>
          </div>
          <div className="nf-meta-barra" role="progressbar" aria-valuemin={0} aria-valuemax={p.requeridas}
            aria-valuenow={Math.min(p.aciertos, p.requeridas)} aria-label={`Aciertos para aprobar: ${Math.min(p.aciertos, p.requeridas)} de ${p.requeridas}`}>
            {Array.from({ length: p.requeridas }, (_, i) => <span key={i} className={i < p.aciertos ? "lleno" : ""} />)}
          </div>
        </div>
      )}

      <div className="nf-escenario">
        {modo === "canvas" ? (
          <div ref={lienzo} className="nf-lienzo" aria-hidden="true" data-testid="lienzo" />
        ) : (
          <EscenaEstatica monstruo={monstruo} />
        )}
        {monstruo && <p className="sr-only">{monstruo.ficha.nombre}: {monstruo.hp} de {monstruo.hpMax} golpes restantes.</p>}

        {fase === "cargando" && <div className="nf-capa"><p className="nf-cargando">Cargando…</p></div>}
      </div>

      {fase === "intro" && info && (
        <div className="nf-bajo">
          <div className="panel oscuro nf-tarjeta">
            <h2>{demo ? "Demostración del nivel final" : "Nivel final"}</h2>
            <p>Cruza el bioma hasta el castillo: cada monstruo es una pregunta con tiempo y el jefe aguarda al final.</p>
            <ul className="nf-chips" aria-label="Reglas del examen">
              <li><strong>{info.n}</strong> preguntas</li>
              <li><strong>{info.requeridas}</strong> para aprobar ({info.g} %)</li>
              <li><strong>{info.margen}</strong> {info.margen === 1 ? "error permitido" : "errores permitidos"}</li>
            </ul>
            <button type="button" className="boton grande" autoFocus disabled={modo === "canvas" && !motorListo}
              onClick={() => { if (sonido) tocar("golpe", true); void irA(0, null); }}>
              {modo === "canvas" && !motorListo ? "Preparando el mundo…" : "¡A la aventura!"}
            </button>
            <ul className="nf-reglas">
              <li>3 aciertos seguidos = <strong>golpe crítico</strong>.</li>
              <li>En su segunda fase el jefe entra en <strong>furia</strong>: menos tiempo.</li>
              <li>Sin mascotas ni objetos. Al aprobar: <strong>cofre legendario</strong>.</li>
            </ul>
          </div>
        </div>
      )}
      {fase === "victoria" && p && (
        <div className="nf-bajo">
          <div className="panel oscuro nf-tarjeta" role="dialog" aria-labelledby="nf-vic">
            <h2 id="nf-vic">¡Meta alcanzada!</h2>
            <p>Llevas {p.aciertos} aciertos de {p.requeridas} necesarios. {p.restantes === 1 ? "Queda 1 pregunta de bonus opcional." : p.restantes > 1 ? `Quedan ${p.restantes} preguntas de bonus opcionales.` : ""}</p>
            <div className="fila">
              <button type="button" className="boton" autoFocus onClick={() => void cerrar()}>Reclamar recompensa</button>
              {p.restantes > 0 && <button type="button" className="boton secundario" onClick={seguirBonus}>Seguir (bonus)</button>}
            </div>
          </div>
        </div>
      )}

      {enCombate && pregunta && info && (
        <section className={`nf-desafio panel ${fase === "feedback" ? "resuelto" : ""}`} aria-label="Desafío">
          <div className="nf-desafio-cab">
            <span className="nf-etq">{monstruo ? `${monstruo.ficha.nombre} · ${TIPO_TXT[monstruo.tipo]}` : "Desafío"}{furia && monstruo?.tipo === "jefe" ? " · ¡FURIA!" : ""}</span>
            {(fase === "desafio" || fase === "resolviendo") && (
              <Temporizador segundos={pregunta.tiempo_s} activo={fase === "desafio"} clave={pregunta.id} onAgotado={() => void responder(null)} />
            )}
          </div>
          {fase === "avanzando" ? (
            <p className="nf-avanza">Avanzando…</p>
          ) : (
            <PreguntaVista pregunta={pregunta} resultado={resultado} onResponder={(r) => void responder(r)} enviando={fase === "resolviendo"} />
          )}
          {error && <p className="error" role="alert">{error}</p>}
          {fase === "feedback" && resultado && (
            <div className={`feedback ${resultado.correcta ? "exito" : "error"} nf-feedback`} role="status">
              <p className="nf-veredicto">{resultado.correcta ? (critico ? "¡GOLPE CRÍTICO!" : "¡Golpe certero!") : "¡El monstruo te golpea!"}</p>
              {!resultado.correcta && <p>Respuesta correcta: <strong>{textoRespuesta(resultado.respuesta_correcta, pregunta.opciones, pregunta.tipo)}</strong></p>}
              {resultado.explicacion && <p>{resultado.explicacion}</p>}
              <button ref={continuarBtn} type="button" className="boton" onClick={() => void continuar()}>Continuar</button>
            </div>
          )}
        </section>
      )}

      {bonus && enCombate && <p className="nf-bonus"><button type="button" className="boton secundario" onClick={() => void cerrar()}>Terminar y reclamar</button></p>}

      {fase === "terminando" && <p className="nf-cargando centro">Guardando resultado…</p>}

      {fase === "fin" && (
        <section className={`panel nf-fin ${aprobado ? "gana" : "pierde"}`} aria-labelledby="nf-fin-t">
          {aprobado && !sinMovimiento && <div className="nf-confeti" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <span key={i} style={{ ["--i" as string]: i }} />)}</div>}
          <h2 id="nf-fin-t" tabIndex={-1} ref={(el) => el?.focus()}>{aprobado ? "¡Aprobaste el nivel final!" : "Esta vez no"}</h2>
          {p && <p>Aciertos: <strong>{p.aciertos}</strong> de {p.n} ({Math.round((100 * p.aciertos) / Math.max(1, p.n))} %) · necesitabas {p.requeridas}.</p>}
          {!aprobado && <p>El castillo resiste. Repasa la sección y vuelve: las preguntas cambian en cada intento.</p>}
          {error && <p className="error" role="alert">{error}</p>}
          {fin && (
            <ul className="nf-premios">
              <li>+{fin.xp_ganada} XP</li>
              {fin.monedas > 0 && <li>+{fin.monedas} monedas</li>}
              {fin.drop && <li>Objeto: {fin.drop.nombre}</li>}
            </ul>
          )}
          {fin?.cofre && (
            <div className={`nf-cofre ${cofreAbriendo ? "abriendo" : ""} ${cofre ? "abierto" : ""}`}>
              <div className="nf-cofre-sprite">
                <span className="nf-rayos" aria-hidden="true" />
                <Sprite src={COFRE_LEGENDARIO} alt="Cofre legendario" tam={128} />
              </div>
              {!cofre ? (
                <button type="button" className="boton grande" onClick={() => void abrirCofre()} disabled={cofreAbriendo}>
                  {cofreAbriendo ? "Abriendo…" : "Abrir cofre legendario"}
                </button>
              ) : (
                <div role="status" className="nf-botin">
                  <p className="nf-etq">¡Botín legendario!</p>
                  <ul>
                    {cofre.items.map((i) => <li key={i.item_id} className={`rareza-${i.rareza ?? "comun"}`}>{i.nombre}</li>)}
                    {cofre.monedas ? <li>+{cofre.monedas} monedas</li> : null}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div className="fila">
            <button type="button" className="boton" onClick={volver}>Volver al camino</button>
            {!aprobado && <button type="button" className="boton secundario" onClick={() => cargar()}>Reintentar</button>}
          </div>
        </section>
      )}

      {salir && (
        <div className="nf-dialogo" role="alertdialog" aria-modal="true" aria-labelledby="nf-salir-t">
          <div className="panel oscuro">
            <h2 id="nf-salir-t">¿Abandonar el nivel final?</h2>
            <p>Perderás el progreso de esta partida (no cuesta vidas). Las preguntas vistas cuentan como vistas.</p>
            <div className="fila">
              <button type="button" className="boton peligro" onClick={volver}>Abandonar</button>
              <button type="button" className="boton secundario" autoFocus onClick={() => setSalir(false)}>Seguir jugando</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Modo sin canvas: el monstruo como sprite estático. */
function EscenaEstatica({ monstruo }: { monstruo: Monstruo | null }) {
  return (
    <div className="nf-estatica" data-testid="sin-canvas">
      {monstruo ? (
        <>
          <Sprite src={monstruo.ficha.idle} alt={monstruo.ficha.nombre} tam={monstruo.ficha.escala * 96} className="nf-monstruo-estatico" />
          <span className="nf-hp" aria-hidden="true">{"■".repeat(monstruo.hp)}{"□".repeat(Math.max(0, monstruo.hpMax - monstruo.hp))}</span>
        </>
      ) : (
        <p className="nf-cargando">Camino al castillo</p>
      )}
    </div>
  );
}
