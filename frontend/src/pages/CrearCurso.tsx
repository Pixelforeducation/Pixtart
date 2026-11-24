import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { TIPOS_PREGUNTA, type ConfigCurso, type Repaso, type TipoPregunta, type Trabajo } from "../api";
import { useApi } from "../contexto";
import { NOMBRE_ESTADO_TRABAJO, NOMBRE_TIPO } from "../lib/textos";
import { mensajeError } from "../lib/validacion";

export const MAX_PDF = 25 * 1024 * 1024;
const MIN_POR_DEFECTO: Partial<Record<TipoPregunta, number>> = { math_problem: 15, proof: 15 };

export interface FormCurso {
  titulo: string;
  num_preguntas: number;
  dificultad: number;
  tipos: TipoPregunta[];
  minutos: Partial<Record<TipoPregunta, string>>;
  repaso: Repaso | "";
  instrucciones: string;
}

export function validarCurso(pdf: File | null, f: FormCurso): Record<string, string> {
  const e: Record<string, string> = {};
  if (!pdf) e.pdf = "Elige un PDF.";
  else if (!/\.pdf$/i.test(pdf.name) && pdf.type !== "application/pdf") e.pdf = "El archivo debe ser un PDF.";
  else if (pdf.size > MAX_PDF) e.pdf = "El PDF pesa más de 25 MB.";
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
  const [pdf, setPdf] = useState<File | null>(null);
  const [encima, setEncima] = useState(false);
  const [f, setF] = useState<FormCurso>({
    titulo: "", num_preguntas: 20, dificultad: 3, tipos: ["multiple_choice", "true_false"],
    minutos: { ...Object.fromEntries(Object.entries(MIN_POR_DEFECTO).map(([k, v]) => [k, String(v)])) }, repaso: "", instrucciones: "",
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.listarKeys().then((ks) => setTieneKey(ks.some((k) => k.estado === "activa"))).catch(() => setTieneKey(false));
  }, [api]);

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setEncima(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setPdf(file);
  };
  const alternarTipo = (t: TipoPregunta) =>
    setF((x) => ({ ...x, tipos: x.tipos.includes(t) ? x.tipos.filter((y) => y !== t) : [...x.tipos, t] }));

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault();
    setErrorGeneral(null);
    const e = validarCurso(pdf, f);
    setErrores(e);
    if (Object.keys(e).length || !pdf) return;
    setEnviando(true);
    try {
      const r = await api.crearCurso(pdf, aConfig(f));
      nav(`/crear/progreso/${r.trabajo_id}?curso=${r.curso_id}`);
    } catch (err) {
      setErrorGeneral(mensajeError(err));
      setEnviando(false);
    }
  };
  const err = (k: string) => errores[k] && <p className="error" id={`err-${k}`}>{errores[k]}</p>;

  return (
    <>
      <h1>Crear curso desde un PDF</h1>
      {tieneKey === false && (
        <p className="aviso" role="status">
          Necesitas conectar tu API key de Anthropic para generar cursos. <Link to="/ajustes">Ir a Ajustes → Tu IA</Link>
        </p>
      )}
      <form onSubmit={enviar} noValidate className="panel">
        <div className="campo">
          <span className="pix-font" style={{ fontSize: 10, display: "block", marginBottom: 8 }} id="lbl-pdf">PDF (máx. 25 MB, 300 págs.)</span>
          <div className={`zona-pdf ${encima ? "encima" : ""}`} onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
            onDragLeave={() => setEncima(false)} onDrop={soltar} data-testid="zona-pdf">
            <p>{pdf ? <>Elegido: <strong>{pdf.name}</strong> ({(pdf.size / 1024 / 1024).toFixed(1)} MB)</> : "Arrastra aquí tu PDF o"}</p>
            <input ref={input} id="pdf" type="file" accept="application/pdf,.pdf" className="sr-only" aria-labelledby="lbl-pdf"
              onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
            <button type="button" className="boton secundario" onClick={() => input.current?.click()}>{pdf ? "Cambiar PDF" : "Elegir archivo"}</button>
          </div>
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
          <p className="ayuda-campo">Deja el tiempo vacío para calcularlo automáticamente.</p>
          {TIPOS_PREGUNTA.map((t) => (
            <div key={t} className="fila" style={{ justifyContent: "space-between" }}>
              <label className="casilla" htmlFor={`tipo-${t}`}>
                <input id={`tipo-${t}`} type="checkbox" checked={f.tipos.includes(t)} onChange={() => alternarTipo(t)} />
                {NOMBRE_TIPO[t]}
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
