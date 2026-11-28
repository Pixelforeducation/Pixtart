import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { TIPOS_PREGUNTA, type ConfigCurso, type Repaso, type TipoPregunta, type Trabajo } from "../api";
import { useApi } from "../contexto";
import { NOMBRE_ESTADO_TRABAJO, NOMBRE_TIPO } from "../lib/textos";
import { mensajeError } from "../lib/validacion";
import { agregarPdfs, MAX_ARCHIVOS, problemaLista, tamanoLegible } from "../lib/pdfs";

export { MAX_PDF } from "../lib/pdfs";
const TIPOS_CURSO = TIPOS_PREGUNTA.filter((t) => t !== "math_problem" && t !== "proof");
const MIN_POR_DEFECTO: Partial<Record<TipoPregunta, number>> = { open: 15 };

export interface FormCurso {
  titulo: string;
  num_preguntas: number;
  dificultad: number;
  tipos: TipoPregunta[];
  minutos: Partial<Record<TipoPregunta, string>>;
  repaso: Repaso | "";
  instrucciones: string;
}

export function validarCurso(pdfs: File[], f: FormCurso): Record<string, string> {
  const e: Record<string, string> = {};
  const problema = problemaLista(pdfs);
  if (problema) e.pdf = problema;
  if (!Number.isInteger(f.num_preguntas) || f.num_preguntas < 5 || f.num_preguntas > 200) e.num_preguntas = "Elige entre 5 y 200 preguntas.";
  if (f.dificultad < 1 || f.dificultad > 5) e.dificultad = "La dificultad va de 1 a 5.";
  if (!f.tipos.length) e.tipos = "Elige al menos un tipo de pregunta.";
  if (!f.repaso) e.repaso = "Elige cómo quieres repasar.";
  if (f.instrucciones.length > 2000) e.instrucciones = "Máximo 2000 caracteres.";
  for (const t of f.tipos) {
    const v = f.minutos[t];
    if (v && (!(Number(v) > 0) || Number(v) > 60)) e[`tiempo_${t}`] = "Escribe minutos entre 0.1 y 60.";
  }
  return e;
}

/** Tipos marcados al abrir el formulario: una mezcla variada (antes solo opción múltiple y V/F). */
export const TIPOS_POR_DEFECTO: TipoPregunta[] = ["multiple_choice", "true_false", "fill_text", "ordering"];

export function aConfig(f: FormCurso): ConfigCurso {
  const tiempos: Partial<Record<TipoPregunta, number>> = {};
  for (const t of f.tipos) {
    const v = f.minutos[t];
    if (v && Number(v) > 0) tiempos[t] = Math.round(Number(v) * 60);
  }
  return {
    ...(f.titulo.trim() ? { titulo: f.titulo.trim() } : {}),
    num_preguntas: f.num_preguntas,
    dificultad: f.dificultad,
    tipos: f.tipos,
    instrucciones: f.instrucciones,
    ...(Object.keys(tiempos).length ? { tiempos_por_tipo: tiempos } : {}),
    repaso: f.repaso as Repaso,
  };
}

export function CrearCurso() {
  const api = useApi();
  const nav = useNavigate();
  const [tieneKey, setTieneKey] = useState<boolean | null>(null);
  const [pdfs, setPdfs] = useState<File[]>([]);
  const [rechazos, setRechazos] = useState<string[]>([]);
  const [encima, setEncima] = useState(false);
  const [f, setF] = useState<FormCurso>({
    titulo: "", num_preguntas: 20, dificultad: 3, tipos: [...TIPOS_POR_DEFECTO],
    minutos: { ...Object.fromEntries(Object.entries(MIN_POR_DEFECTO).map(([k, v]) => [k, String(v)])) }, repaso: "", instrucciones: "",
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    api.listarKeys().then((ks) => setTieneKey(ks.some((k) => k.estado === "activa"))).catch(() => setTieneKey(false));
  }, [api]);

  const agregar = (lista: FileList | null | undefined) => {
    const nuevos = Array.from(lista ?? []);
    if (!nuevos.length) return;
    const r = agregarPdfs(pdfs, nuevos);
    setPdfs(r.archivos);
    setRechazos(r.rechazos);
    if (r.archivos.length) setErrores(({ pdf: _, ...resto }) => resto);
  };
  const quitar = (i: number) => {
    setPdfs((xs) => xs.filter((_, j) => j !== i));
    setRechazos([]);
    boton.current?.focus();
  };
  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setEncima(false);
    agregar(e.dataTransfer.files);
  };
  const alternarTipo = (t: TipoPregunta) =>
    setF((x) => ({ ...x, tipos: x.tipos.includes(t) ? x.tipos.filter((y) => y !== t) : [...x.tipos, t] }));

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault();
    setErrorGeneral(null);
    const e = validarCurso(pdfs, f);
    setErrores(e);
    if (Object.keys(e).length || !pdfs.length) return;
    setEnviando(true);
    try {
      const r = await api.crearCurso(pdfs, aConfig(f));
      nav(`/crear/progreso/${r.trabajo_id}?curso=${r.curso_id}`);
    } catch (err) {
      setErrorGeneral(mensajeError(err));
      setEnviando(false);
    }
  };
  const err = (k: string) => errores[k] && <p className="error" id={`err-${k}`}>{errores[k]}</p>;

  return (
    <>
      <h1>Crear curso desde tus PDFs</h1>
      {tieneKey === false && (
        <p className="aviso" role="status">
          Necesitas conectar tu API key de Anthropic para generar cursos. <Link to="/ajustes">Ir a Ajustes → Tu IA</Link>
        </p>
      )}
      <form onSubmit={enviar} noValidate className="panel">
        <div className="campo">
          <span className="pix-font" style={{ fontSize: 10, display: "block", marginBottom: 8 }} id="lbl-pdf">
            PDFs (hasta {MAX_ARCHIVOS}; máx. 25 MB cada uno, 100 MB y 600 págs. en total)
          </span>
          <div className={`zona-pdf ${encima ? "encima" : ""}`} onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
            onDragLeave={() => setEncima(false)} onDrop={soltar} data-testid="zona-pdf">
            <p>{pdfs.length ? "Puedes arrastrar más PDFs aquí o" : "Arrastra aquí tus PDFs o"}</p>
            <input ref={input} id="pdf" type="file" multiple accept="application/pdf,.pdf" className="sr-only" aria-labelledby="lbl-pdf"
              aria-describedby={errores.pdf ? "err-pdf" : undefined}
              onChange={(e) => { agregar(e.target.files); e.target.value = ""; }} />
            <button ref={boton} type="button" className="boton secundario" onClick={() => input.current?.click()}>
              {pdfs.length ? "Añadir más PDFs" : "Elegir archivos"}
            </button>
          </div>
          {pdfs.length > 0 && (
            <ul className="lista-pdfs" aria-label="PDFs elegidos">
              {pdfs.map((x, i) => (
                <li key={`${x.name}-${x.size}-${x.lastModified}-${i}`}>
                  <span><strong>{x.name}</strong> ({tamanoLegible(x.size)})</span>
                  <button type="button" className="boton secundario" aria-label={`Quitar ${x.name}`} onClick={() => quitar(i)}>Quitar</button>
                </li>
              ))}
            </ul>
          )}
          <p className="ayuda-campo" aria-live="polite">
            {pdfs.length === 1 ? "1 PDF elegido" : `${pdfs.length} PDFs elegidos`}
            {pdfs.length ? ` · ${tamanoLegible(pdfs.reduce((s, x) => s + x.size, 0))} en total` : ""}
          </p>
          {rechazos.length > 0 && (
            <div className="error" role="alert">{rechazos.map((r) => <p key={r}>{r}</p>)}</div>
          )}
          {err("pdf")}
        </div>
        <div className="campo">
          <label htmlFor="titulo">Título (opcional)</label>
          <input id="titulo" type="text" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
        </div>
        <div className="campo">
          <label htmlFor="num">Número de preguntas (5–200)</label>
          <input id="num" type="number" min={5} max={200} value={f.num_preguntas} aria-invalid={!!errores.num_preguntas}
            onChange={(e) => setF({ ...f, num_preguntas: Number(e.target.value) })} />
          {err("num_preguntas")}
        </div>
        <div className="campo">
          <label htmlFor="dif">Dificultad: {f.dificultad} de 5</label>
          <input id="dif" type="range" min={1} max={5} step={1} value={f.dificultad} style={{ width: "100%" }}
            onChange={(e) => setF({ ...f, dificultad: Number(e.target.value) })} />
        </div>
        <fieldset>
          <legend>Tipos de pregunta y tiempo por pregunta</legend>
          <p className="ayuda-campo">Las preguntas se reparten de forma equilibrada entre los tipos que marques. Deja el tiempo vacío para calcularlo automáticamente.</p>
          {TIPOS_CURSO.map((t) => (
            <div key={t} className="fila" style={{ justifyContent: "space-between" }}>
              <label className="casilla" htmlFor={`tipo-${t}`}>
                <input id={`tipo-${t}`} type="checkbox" checked={f.tipos.includes(t)} onChange={() => alternarTipo(t)} />
                {t === "open" ? "Abierta (incluye problemas matemáticos y demostraciones)" : NOMBRE_TIPO[t]}
              </label>
              {f.tipos.includes(t) && (
                <span className="fila" style={{ gap: 4 }}>
                  <label htmlFor={`min-${t}`} className="sr-only">Minutos para {NOMBRE_TIPO[t]}</label>
                  <input id={`min-${t}`} type="number" min={0.1} max={60} step={0.5} placeholder="auto" style={{ width: 100 }}
                    value={f.minutos[t] ?? ""} onChange={(e) => setF({ ...f, minutos: { ...f.minutos, [t]: e.target.value } })} />
                  <span aria-hidden="true">min</span>
                </span>
              )}
              {err(`tiempo_${t}`)}
            </div>
          ))}
          {err("tipos")}
        </fieldset>
        <fieldset>
          <legend>¿Cómo prefieres repasar?</legend>
          <label className="casilla"><input type="radio" name="repaso" value="fsrs" checked={f.repaso === "fsrs"} onChange={() => setF({ ...f, repaso: "fsrs" })} />
            FSRS: calcula el mejor momento para repasar cada pregunta</label>
          <label className="casilla"><input type="radio" name="repaso" value="leitner" checked={f.repaso === "leitner"} onChange={() => setF({ ...f, repaso: "leitner" })} />
            Leitner: cajas; lo que fallas vuelve antes</label>
          {err("repaso")}
        </fieldset>
        <div className="campo">
          <label htmlFor="instr">Instrucciones para la IA (opcional)</label>
          <textarea id="instr" maxLength={2000} value={f.instrucciones} onChange={(e) => setF({ ...f, instrucciones: e.target.value })}
            placeholder="Ej.: céntrate en los capítulos 2 y 3; evita fechas." />
          <p className="ayuda-campo">{f.instrucciones.length}/2000</p>
          {err("instrucciones")}
        </div>
        {errorGeneral && <p className="error" role="alert">{errorGeneral}</p>}
        <button className="boton" disabled={enviando || tieneKey === false}>{enviando ? "Subiendo…" : "Crear curso"}</button>
      </form>
    </>
  );
}

export function ProgresoTrabajo({ intervaloMs = 2000 }: { intervaloMs?: number }) {
  const api = useApi();
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const cursoId = params.get("curso");
  const [t, setT] = useState<Trabajo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    let timer: ReturnType<typeof setTimeout>;
    const consultar = async () => {
      try {
        const r = await api.trabajo(id);
        if (!vivo) return;
        setT(r);
        if (r.estado !== "listo" && r.estado !== "error") timer = setTimeout(consultar, intervaloMs);
      } catch (e) {
        if (vivo) setError(mensajeError(e));
        timer = setTimeout(consultar, intervaloMs * 2);
      }
    };
    void consultar();
    return () => { vivo = false; clearTimeout(timer); };
  }, [api, id, intervaloMs]);

  return (
    <>
      <h1>Creando tu curso</h1>
      <div className="panel" aria-live="polite">
        <p className="pix-font" style={{ fontSize: 12 }}>{t ? NOMBRE_ESTADO_TRABAJO[t.estado] ?? t.estado : "Conectando…"}</p>
        <div className="barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={t?.progreso ?? 0} aria-label="Progreso">
          <span style={{ width: `${t?.progreso ?? 0}%` }} />
        </div>
        <p style={{ marginTop: 8 }}>{t?.progreso ?? 0}% {t?.mensaje ? `· ${t.mensaje}` : ""}</p>
        {t?.estado === "error" && <p className="error" role="alert">{t.error || "No se pudo crear el curso."}</p>}
        {error && <p className="error">{error}</p>}
        {t?.estado === "listo" && cursoId && (
          <button className="boton" onClick={() => nav(`/cursos/${cursoId}/revisar`)} autoFocus>Revisar preguntas</button>
        )}
        {t?.estado === "error" && <Link className="boton secundario" to="/crear">Intentar de nuevo</Link>}
      </div>
    </>
  );
}
