import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Camino, CofreAbierto, CursoResumen, EtapaMascota, Equipo, NodoCamino } from "../api";
import { useApi, useEstadoJuego } from "../contexto";
import { Candado } from "../components/Iconos";
import { nombreItem } from "../components/ItemIcono";
import { biomaDeCurso, Escena, Portada, useIntensidad } from "../escenas";
import { AnilloMeta, Castillo, Estrella, Llama } from "../escenas/hud";
import { avanceDeHoy, META_DIARIA } from "../escenas/metaDiaria";
import { sonar } from "../escenas/sonido";
import { CofreVisual, HeroeVisual, IconoUI, ItemVisual, MascotaVisual } from "../escenas/visuales";
import { mensajeError } from "../lib/validacion";

type TipoVisual = NodoCamino["tipo"];
const tipoDe = (n: NodoCamino): TipoVisual => n.tipo;

const ESTADO_TXT = { bloqueado: "bloqueado", disponible: "disponible", actual: "siguiente", completado: "completado" } as const;
const TIPO_TXT: Record<TipoVisual, string> = { calentamiento: "Calentamiento", leccion: "Lección", cofre: "Cofre", final: "Nivel final" };

const reducido = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------- geometría del camino
const ANCHO = 340; // ancho lógico del mapa (px); se centra en pantallas anchas
const PASO = 112; // separación vertical entre nodos
const ARRIBA = 100; // espacio para el globo «¡JUGAR!» del primer nodo
const xDe = (i: number) => ANCHO / 2 + 92 * Math.sin(i * 0.9);

/** Curva suave (Catmull-Rom → Bézier) que pasa por todos los puntos. */
function trazo(p: [number, number][]): string {
  if (p.length === 0) return "";
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/** Cuántos niveles faltan para el siguiente cofre cerrado de la sección (para el «¡casi!»). */
function faltanParaCofre(niveles: NodoCamino[]): number | null {
  let faltan = 0;
  for (const n of niveles) {
    if (n.tipo === "cofre") {
      if (n.estado !== "completado") return faltan;
      faltan = 0;
    } else if (n.estado !== "completado") faltan++;
  }
  return null;
}

function Glifo({ n }: { n: NodoCamino }) {
  if (n.estado === "bloqueado") return <Candado tam={28} />;
  if (n.estado === "completado") return <Estrella tam={34} />;
  return <span aria-hidden="true" className="glifo">{n.tipo === "calentamiento" ? "☼" : "▶"}</span>;
}

interface Actores { tier: number; especie?: string | null; equipo?: Equipo | null; etapa?: EtapaMascota }
type Pista = { id: string; txt: string } | null;

function Nodo({ n, i, previo, cerca, actores, onTocar, refActual }: {
  n: NodoCamino; i: number; previo?: NodoCamino; cerca: boolean; actores: Actores;
  onTocar: (n: NodoCamino, previo?: NodoCamino) => void; refActual: RefObject<HTMLButtonElement>;
}) {
  const tipo = tipoDe(n);
  const bloq = n.estado === "bloqueado";
  const etiqueta = `${TIPO_TXT[tipo]}: ${n.titulo} (${ESTADO_TXT[n.estado]})`;
  const x = xDe(i);
  const izquierda = x < ANCHO / 2;
  return (
    <div className={`paso ${n.estado} tipo-${tipo}`} style={{ left: x, top: ARRIBA + i * PASO }}>
      {n.estado === "actual" && tipo !== "cofre" && (
        <>
          <span className="empieza" aria-hidden="true">{tipo === "final" ? "¡JEFE!" : "¡JUGAR!"}</span>
          <div className={`actor ${izquierda ? "a-la-derecha" : "a-la-izquierda"}`} aria-hidden="true">
            <HeroeVisual tier={actores.tier} equipo={actores.equipo} alt="" className="heroe" />
          </div>
          {actores.especie && (
            <div className={`actor-mascota ${izquierda ? "a-la-izquierda" : "a-la-derecha"}`} aria-hidden="true">
              <MascotaVisual especie={actores.especie} etapa={actores.etapa} alt="" />
            </div>
          )}
        </>
      )}
      <button type="button" ref={n.estado === "actual" ? refActual : undefined}
        className={`nodo ${n.estado} ${tipo} ${cerca ? "cerca" : ""}`} aria-label={etiqueta} title={etiqueta}
        aria-disabled={bloq || (tipo === "cofre" && n.estado === "completado")}
        aria-current={n.estado === "actual" ? "step" : undefined}
        onClick={(e) => {
          const el = e.currentTarget;
          el.classList.remove("tocado"); void el.offsetWidth; el.classList.add("tocado");
          onTocar(n, previo);
        }}>
        {n.estado === "actual" && <span className="anillo" aria-hidden="true" />}
        {tipo === "cofre" ? <CofreVisual />
          : tipo === "final" ? <Castillo tam={84} apagado={bloq} />
          : <Glifo n={n} />}
      </button>
      {(n.estado === "actual" || tipo === "final") && <span className="etq" aria-hidden="true">{n.titulo}</span>}
    </div>
  );
}

export function CaminoVista({ camino, cursoId, onCofre, actores = { tier: 1 } }: { camino: Camino; cursoId: string | number; onCofre: (n: NodoCamino) => void; actores?: Actores }) {
  const nav = useNavigate();
  const int = useIntensidad();
  const actual = useRef<HTMLButtonElement>(null);
  const [pista, setPista] = useState<Pista>(null);
  useEffect(() => {
    const el = actual.current;
    if (!el || typeof window.scrollTo !== "function") return;
    const r = el.getBoundingClientRect();
    try {
      window.scrollTo({ top: Math.max(0, window.scrollY + r.top - window.innerHeight * 0.55), behavior: reducido() ? "auto" : "smooth" });
    } catch { /* jsdom */ }
  }, [camino]);
  useEffect(() => {
    if (!pista) return;
    const t = setTimeout(() => setPista(null), 2600);
    return () => clearTimeout(t);
  }, [pista]);

  // Nivel jugable anterior de cada nodo, cruzando secciones (para «Completa X para desbloquearlo»).
  const previoDe = useMemo(() => {
    const m = new Map<string, NodoCamino>();
    let ultimo: NodoCamino | undefined;
    for (const s of camino.secciones) for (const n of s.niveles) {
      if (ultimo) m.set(String(n.id), ultimo);
      if (n.tipo !== "cofre" && n.tipo !== "final") ultimo = n; // el jefe no cierra la sección siguiente
    }
    return m;
  }, [camino]);

  const tocar = (n: NodoCamino, previo?: NodoCamino) => {
    const tipo = tipoDe(n);
    if (n.estado === "bloqueado") {
      sonar("bloqueado");
      const txt = tipo === "cofre"
        ? "Completa los niveles de antes para abrir este cofre."
        : tipo === "final" ? "Completa la sección para retar al jefe del castillo."
        : previo ? `Completa «${previo.titulo}» para desbloquearlo.` : "Aún está bloqueado.";
      setPista({ id: String(n.id), txt });
      return;
    }
    if (tipo === "cofre") { if (n.estado !== "completado") { sonar("cofre"); onCofre(n); } return; }
    sonar("nodo");
    const ruta = tipo === "final" ? `/final/${n.id}?curso=${cursoId}` : `/jugar/${n.id}?curso=${cursoId}`;
    if (int === 0) nav(ruta);
    else setTimeout(() => nav(ruta), 200);
  };

  return (
    <div className="camino">
      {camino.secciones.map((s, si) => {
        const niveles = s.niveles;
        const jugables = niveles.filter((n) => n.tipo !== "cofre");
        const hechos = jugables.filter((n) => n.estado === "completado").length;
        const faltan = faltanParaCofre(niveles);
        const abierta = niveles.some((n) => n.tipo !== "cofre" && n.estado !== "bloqueado");
        const iCofre = niveles.findIndex((n) => n.tipo === "cofre" && n.estado !== "completado");
        // El nivel final llega del backend como un nodo más (tipo "final"); si un curso no lo trae, no se
        // inventa un castillo de adorno.
        const total = niveles.length;
        const puntos: [number, number][] = Array.from({ length: total }, (_, i) => [xDe(i), ARRIBA + i * PASO]);
        let hasta = -1; // tramo recorrido: hasta el último nodo no bloqueado
        niveles.forEach((n, i) => { if (n.estado !== "bloqueado") hasta = i; });
        const alto = ARRIBA + (total - 1) * PASO + 96;
        return (
          <section key={s.id} className="seccion-camino" aria-label={`Sección ${s.titulo}`}>
            <header className="cartel-seccion">
              <span className="cartel-num">Sección {si + 1}</span>
              <h2>{s.titulo}</h2>
              <div className="cartel-avance">
                <div className="barra oro llenar" role="progressbar" aria-label={`Progreso de ${s.titulo}`} aria-valuemin={0} aria-valuemax={jugables.length} aria-valuenow={hechos}>
                  <span style={{ width: `${jugables.length ? (hechos / jugables.length) * 100 : 0}%` }} />
                </div>
                <span className="avance">{hechos}/{jugables.length}</span>
              </div>
              {abierta && faltan !== null && faltan > 0 && faltan <= 2 && (
                <span className="casi">¡Te falta{faltan > 1 ? "n" : ""} {faltan} para el cofre!</span>
              )}
              {hechos === jugables.length && jugables.length > 0 && <span className="casi listo">¡Sección dominada!</span>}
            </header>
            <div className="mapa" style={{ height: alto }}>
              <svg className="sendero" viewBox={`0 0 ${ANCHO} ${alto}`} width={ANCHO} height={alto} aria-hidden="true">
                <path d={trazo(puntos)} className="sendero-borde" />
                <path d={trazo(puntos)} className="sendero-tierra" />
                <path d={trazo(puntos)} className="sendero-piedras" />
                {hasta > 0 && <path d={trazo(puntos.slice(0, hasta + 1))} className="sendero-hecho" />}
              </svg>
              {niveles.map((n, i) => (
                <Nodo key={n.id} n={n} i={i} previo={previoDe.get(String(n.id))}
                  cerca={abierta && i === iCofre && faltan !== null && faltan <= 1}
                  actores={actores} onTocar={tocar} refActual={actual} />
              ))}
            </div>
          </section>
        );
      })}
      {pista && <p key={pista.id + pista.txt} className="pista-camino" role="status">{pista.txt}</p>}
    </div>
  );
}

function TarjetaCurso({ c, elegido, onElegir }: { c: CursoResumen; elegido: boolean; onElegir: () => void }) {
  const bioma = biomaDeCurso(c);
  const borrador = c.estado === "borrador";
  const cuerpo = (
    <>
      <div className="portada"><Portada bioma={bioma} /></div>
      {borrador && <span className="sello">BORRADOR</span>}
      <div className="info">
        <strong>{c.titulo}</strong>
        <span>{borrador ? "Revisa y publica" : c.tema || "Curso"}</span>
      </div>
    </>
  );
  if (borrador) return <Link to={`/cursos/${c.id}/revisar`} className="tarjeta-curso">{cuerpo}</Link>;
  return (
    <button type="button" className="tarjeta-curso" aria-current={elegido} onClick={() => { sonar("toque"); onElegir(); }} aria-label={`Jugar ${c.titulo}${elegido ? " (elegido)" : ""}`}>
      {cuerpo}
    </button>
  );
}

function DialogoCofre({ cofre, onCerrar }: { cofre: CofreAbierto; onCerrar: () => void }) {
  return (
    <div className="velo-dialogo" onClick={onCerrar}>
      <div className="panel pergamino dialogo-cofre" role="dialog" aria-modal="true" aria-label="Cofre abierto" onClick={(e) => e.stopPropagation()}>
        <div className="rayos-cofre"><CofreVisual tipo={cofre.items.some((i) => i.rareza === "legendaria") ? "legendario" : "normal"} /></div>
        <h2 style={{ marginTop: 0 }}>¡Cofre abierto!</h2>
        <div className="botin">
          <span className="hud-chip oro"><IconoUI id="moneda" /> +{cofre.monedas}</span>
          {cofre.items.map((i) => (
            <span key={i.item_id} className={`slot ${i.rareza}`} style={{ padding: 6 }}>
              <ItemVisual id={i.item_id} />
              <span style={{ fontSize: 16, color: "var(--texto)" }}>{i.nombre || nombreItem(i.item_id)}</span>
            </span>
          ))}
        </div>
        <p>+{cofre.monedas} monedas{cofre.items.length ? ` · ${cofre.items.map((i) => i.nombre).join(", ")}` : ""}</p>
        <button className="boton" onClick={onCerrar} autoFocus>Genial</button>
      </div>
    </div>
  );
}

/** Racha + meta diaria: la razón para volver mañana, siempre arriba del mapa. */
function PanelDia({ racha, hoy }: { racha: number; hoy: number }) {
  const lista = hoy >= META_DIARIA;
  const avisado = useRef(lista);
  useEffect(() => { if (lista && !avisado.current) { avisado.current = true; sonar("meta"); } }, [lista]);
  const faltan = META_DIARIA - hoy;
  return (
    <section className="panel-dia aparece" aria-label="Tu día">
      <div className="dia-racha">
        <Llama racha={racha} tam={36} />
        <div>
          <strong className="pix-font">{racha} {racha === 1 ? "día" : "días"}</strong>
          <span>{racha > 0 ? (lista ? "¡Racha a salvo!" : "Juega hoy para no perderla") : "Juega un nivel para encenderla"}</span>
        </div>
      </div>
      <div className="dia-meta">
        <AnilloMeta hechos={hoy} meta={META_DIARIA} tam={56}>
          <span className="pix-font">{Math.min(hoy, META_DIARIA)}/{META_DIARIA}</span>
        </AnilloMeta>
        <div>
          <strong className="pix-font">Meta de hoy</strong>
          <span>{lista ? "¡Cumplida!" : `${faltan} ${faltan === 1 ? "nivel" : "niveles"} más`}</span>
        </div>
      </div>
    </section>
  );
}

export function Inicio() {
  const api = useApi();
  const { estado, refrescar } = useEstadoJuego();
  const [params, setParams] = useSearchParams();
  const [cursos, setCursos] = useState<CursoResumen[] | null>(null);
  const [camino, setCamino] = useState<Camino | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cofre, setCofre] = useState<CofreAbierto | null>(null);

  useEffect(() => {
    api.listarCursos().then(setCursos).catch((e) => setError(mensajeError(e)));
  }, [api]);

  const publicados = (cursos ?? []).filter((c) => c.estado === "publicado");
  const borradores = (cursos ?? []).filter((c) => c.estado === "borrador");
  const elegido = params.get("curso") ?? (publicados[0] ? String(publicados[0].id) : null);
  const cursoElegido = publicados.find((c) => String(c.id) === elegido) ?? null;

  useEffect(() => {
    if (!elegido) return;
    setCamino(null);
    api.camino(elegido).then(setCamino).catch((e) => setError(mensajeError(e)));
  }, [api, elegido]);

  const abrirCofre = async (n: NodoCamino) => {
    try {
      setCofre(await api.abrirCofre(n.id));
      void refrescar();
      if (elegido) setCamino(await api.camino(elegido));
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  const hechos = useMemo(
    () => camino?.secciones.flatMap((s) => s.niveles).filter((n) => n.tipo !== "cofre" && n.estado === "completado").length ?? 0,
    [camino],
  );
  const hoy = useMemo(() => (elegido && camino ? avanceDeHoy(elegido, hechos) : 0), [elegido, camino, hechos]);
  const tier = cursoElegido ? estado?.tier_por_tema[cursoElegido.tema] ?? 1 : 1;
  const especie = estado?.mascota?.viva ? estado.mascota.especie : null;
  const bioma = biomaDeCurso(cursoElegido);

  if (cursos === null) {
    return <Escena bioma="pradera">{error ? <p className="error" role="alert">{error}</p> : <p className="placa">Cargando…</p>}</Escena>;
  }

  return (
    <Escena bioma={bioma}>
      {estado && <PanelDia racha={estado.racha} hoy={hoy} />}
      <div className="titulo-pantalla">
        <h1>Tus cursos</h1>
        <Link to="/crear" className="boton chico" onClick={() => sonar("toque")}>+ Nuevo</Link>
      </div>
      {cursos.length === 0 ? (
        <div className="panel pergamino centro aparece" style={{ marginTop: 16 }}>
          <h2>¡Tu aventura empieza aquí!</h2>
          <p>Aún no tienes cursos. Sube un PDF y la IA armará un camino de niveles para ti.</p>
          <Link to="/crear" className="boton grande">Crear mi primer curso</Link>
        </div>
      ) : (
        <div className="cursos" role="list" aria-label="Cursos">
          {[...publicados, ...borradores].map((c) => (
            <div role="listitem" key={c.id} style={{ display: "contents" }}>
              <TarjetaCurso c={c} elegido={String(c.id) === elegido} onElegir={() => setParams({ curso: String(c.id) })} />
            </div>
          ))}
          <div role="listitem" style={{ display: "contents" }}>
            <Link to="/crear" className="tarjeta-curso nuevo"><span><span className="mas" aria-hidden="true">+</span><br />Nuevo curso</span></Link>
          </div>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {cofre && <DialogoCofre cofre={cofre} onCerrar={() => setCofre(null)} />}
      {elegido && !camino && !error && <p className="placa">Cargando camino…</p>}
      {elegido && camino && <CaminoVista camino={camino} cursoId={elegido} onCofre={abrirCofre} actores={{ tier, especie, equipo: estado?.equipo ?? null, etapa: estado?.mascota?.etapa }} />}
    </Escena>
  );
}
