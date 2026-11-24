import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Camino, CofreAbierto, CursoResumen, NodoCamino } from "../api";
import { useApi, useEstadoJuego } from "../contexto";
import { Sprite } from "../components/Sprite";
import { Candado } from "../components/Iconos";
import { mensajeError } from "../lib/validacion";

const ESTADO_TXT = { bloqueado: "bloqueado", disponible: "disponible", actual: "siguiente", completado: "completado" } as const;
const TIPO_TXT = { calentamiento: "Calentamiento", leccion: "Lección", cofre: "Cofre" } as const;

const reducido = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function IconoNodo({ n }: { n: NodoCamino }) {
  if (n.tipo === "cofre") return <Sprite src="/sprites/chest-normal.svg" alt="" />;
  if (n.estado === "bloqueado") return <Candado tam={32} />;
  const ch = n.estado === "completado" ? "★" : n.tipo === "calentamiento" ? "☼" : "▶";
  return <span aria-hidden="true" className="pix-font" style={{ fontSize: 26, color: "var(--texto-osc)" }}>{ch}</span>;
}

export function CaminoVista({ camino, cursoId, onCofre }: { camino: Camino; cursoId: string | number; onCofre: (n: NodoCamino) => void }) {
  const nav = useNavigate();
  const actual = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = actual.current;
    if (!el || typeof window.scrollTo !== "function") return;
    const r = el.getBoundingClientRect();
    try {
      window.scrollTo({ top: Math.max(0, window.scrollY + r.top - window.innerHeight / 2), behavior: reducido() ? "auto" : "smooth" });
    } catch { /* jsdom */ }
  }, [camino]);

  return (
    <div className="camino">
      {camino.secciones.map((s) => (
        <div key={s.id} className="camino" style={{ padding: 0, width: "100%" }} role="group" aria-label={`Sección ${s.titulo}`}>
          <h2 className="titulo-seccion">{s.titulo}</h2>
          {s.niveles.map((n) => {
            const bloq = n.estado === "bloqueado";
            const etiqueta = `${TIPO_TXT[n.tipo]}: ${n.titulo} (${ESTADO_TXT[n.estado]})`;
            return (
              <button key={n.id} type="button" ref={n.estado === "actual" ? actual : undefined}
                className={`nodo ${n.estado} ${n.tipo}`} aria-label={etiqueta} title={etiqueta}
                aria-disabled={bloq || (n.tipo === "cofre" && n.estado === "completado")}
                aria-current={n.estado === "actual" ? "step" : undefined}
                onClick={() => {
                  if (bloq) return;
                  if (n.tipo === "cofre") { if (n.estado !== "completado") onCofre(n); return; }
                  nav(`/jugar/${n.id}?curso=${cursoId}`);
                }}>
                {n.estado === "actual" && <span className="empieza" aria-hidden="true">¡EMPIEZA!</span>}
                <IconoNodo n={n} />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function Inicio() {
  const api = useApi();
  const { refrescar } = useEstadoJuego();
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

  if (cursos === null) return error ? <p className="error" role="alert">{error}</p> : <p>Cargando…</p>;

  return (
    <>
      <div className="fila" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Tus cursos</h1>
        <Link to="/crear" className="boton chico">+ Nuevo curso</Link>
      </div>
      {cursos.length === 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <p>Aún no tienes cursos. Sube un PDF y la IA armará un camino de niveles para ti.</p>
          <Link to="/crear" className="boton">Crear mi primer curso</Link>
        </div>
      )}
      {publicados.length > 0 && (
        <div className="campo" style={{ marginTop: 16 }}>
          <label htmlFor="sel-curso">Curso</label>
          <select id="sel-curso" value={elegido ?? ""} onChange={(e) => setParams({ curso: e.target.value })}>
            {publicados.map((c) => <option key={c.id} value={c.id}>{c.titulo}</option>)}
          </select>
        </div>
      )}
      {borradores.length > 0 && (
        <details className="panel oscuro">
          <summary>Borradores por revisar ({borradores.length})</summary>
          <ul>{borradores.map((c) => <li key={c.id}><Link to={`/cursos/${c.id}/revisar`}>{c.titulo}</Link></li>)}</ul>
        </details>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {cofre && (
        <div className="panel centro" role="dialog" aria-label="Cofre abierto">
          <Sprite src="/sprites/chest-normal.svg" alt="" tam={96} />
          <h2>¡Cofre abierto!</h2>
          <p>+{cofre.monedas} monedas{cofre.items.length ? ` · ${cofre.items.map((i) => i.nombre).join(", ")}` : ""}</p>
          <button className="boton" onClick={() => setCofre(null)} autoFocus>Genial</button>
        </div>
      )}
      {elegido && !camino && !error && <p>Cargando camino…</p>}
      {elegido && camino && <CaminoVista camino={camino} cursoId={elegido} onCofre={abrirCofre} />}
    </>
  );
}
