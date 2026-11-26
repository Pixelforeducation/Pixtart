import { useEffect, useState, type FormEvent } from "react";
import type { ApiKey, Limites } from "../api";
import { useApi, useEstadoJuego, useSesion } from "../contexto";
import { mensajeError } from "../lib/validacion";
import { AjusteAnimaciones } from "../escenas/AjusteAnimaciones";
import { AjusteSonido } from "../components/AjusteSonido";

const fmt = (n: number) => n.toLocaleString("es-MX");
export const MINIMO_DEF = 60;
const PASOS_MINIMO = Array.from({ length: 11 }, (_, i) => i * 10);

/** Mínimo de aciertos para pasar un nivel (0–100 %, pasos de 10). Se guarda en el servidor (Estado.minimo_aprobar). */
function AjusteMinimo() {
  const api = useApi();
  const { estado, poner } = useEstadoJuego();
  const actual = estado?.minimo_aprobar ?? MINIMO_DEF;
  const [guardando, setGuardando] = useState(false);
  const [msj, setMsj] = useState<{ ok: boolean; txt: string } | null>(null);

  const cambiar = async (v: number) => {
    setGuardando(true);
    setMsj(null);
    try {
      poner(await api.guardarAjustesJuego({ minimo_aprobar: v }));
      setMsj({ ok: true, txt: `Guardado: necesitas ${v} % de aciertos para pasar un nivel.` });
    } catch (err) {
      setMsj({ ok: false, txt: mensajeError(err) });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="h-minimo">
      <h2 id="h-minimo" style={{ marginTop: 0 }}>Mínimo para pasar un nivel</h2>
      <div className="campo">
        <label htmlFor="minimo-aprobar">Porcentaje de aciertos</label>
        <select id="minimo-aprobar" value={actual} disabled={!estado || guardando}
          onChange={(e) => void cambiar(Number(e.target.value))}>
          {PASOS_MINIMO.map((v) => <option key={v} value={v}>{v} %{v === MINIMO_DEF ? " (recomendado)" : ""}</option>)}
        </select>
      </div>
      <p className="ayuda-campo">Si no llegas, repites el nivel con preguntas diferentes de la misma dificultad. El nivel final tiene su propia regla.</p>
      {msj && <p className={msj.ok ? "exito" : "error"} role={msj.ok ? "status" : "alert"}>{msj.txt}</p>}
    </section>
  );
}

export function Ajustes() {
  const api = useApi();
  const { salir } = useSesion();
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [limites, setLimites] = useState<Limites | null>(null);
  const [nueva, setNueva] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmar, setConfirmar] = useState<ApiKey | null>(null);
  const [topes, setTopes] = useState({ diario: "", mensual: "" });

  useEffect(() => {
    api.listarKeys().then(setKeys).catch((e) => setError(mensajeError(e)));
    api.obtenerLimites().then((l) => {
      setLimites(l);
      setTopes({ diario: String(l.tope_diario_tokens), mensual: String(l.tope_mensual_tokens) });
    }).catch(() => {});
  }, [api]);

  const conectar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setAviso(null);
    if (!nueva.trim()) return setError("Pega tu API key de Anthropic.");
    setEnviando(true);
    try {
      const k = await api.crearKey({ proveedor: "anthropic", api_key: nueva.trim() });
      setNueva(""); // la key no se guarda en el frontend
      setKeys([k]);
      setAviso(`Key conectada y validada (…${k.ultimos4}).`);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  };

  const revocar = async (k: ApiKey) => {
    setError(null);
    try {
      await api.borrarKey(k.id);
      setKeys((ks) => (ks ?? []).filter((x) => x.id !== k.id));
      setAviso("Key revocada: borramos el material cifrado.");
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setConfirmar(null);
    }
  };

  const guardarTopes = async (e: FormEvent) => {
    e.preventDefault();
    const d = Number(topes.diario), m = Number(topes.mensual);
    if (!Number.isInteger(d) || !Number.isInteger(m) || d < 0 || m < 0) return setError("Los topes deben ser números enteros positivos.");
    if (d > m) return setError("El tope diario no puede ser mayor que el mensual.");
    try {
      setLimites(await api.guardarLimites({ tope_diario_tokens: d, tope_mensual_tokens: m }));
      setAviso("Topes guardados.");
      setError(null);
    } catch (err) {
      setError(mensajeError(err));
    }
  };

  const activa = keys?.[0];

  return (
    <>
      <h1>Ajustes</h1>
      <section className="panel" aria-labelledby="tu-ia">
        <h2 id="tu-ia" style={{ marginTop: 0 }}>Tu IA</h2>
        <p>Pixtart usa <strong>tu propia API key de Anthropic</strong> para crear cursos a partir de tus PDF y para la retroalimentación con IA.</p>
        <details>
          <summary>¿Qué datos se envían?</summary>
          <ul>
            <li>El texto extraído de tus PDF (por partes) y tus instrucciones, para generar preguntas.</li>
            <li>Tu respuesta y la pregunta, solo cuando pides retroalimentación con IA.</li>
            <li>La key se guarda cifrada en el servidor; nunca vuelve a mostrarse: solo ves sus últimos 4 caracteres.</li>
            <li>El PDF se borra al terminar de procesarlo.</li>
          </ul>
        </details>
        {keys === null ? <p>Cargando…</p> : activa ? (
          <div className="panel oscuro" style={{ marginTop: 12 }}>
            <p>Key conectada: <strong className="pix-font" style={{ fontSize: 12 }}>…{activa.ultimos4}</strong>{" "}
              {activa.estado === "invalida" ? <span className="etiqueta mala">inválida</span> : <span className="etiqueta">activa</span>}
            </p>
            {activa.modelo && <p>Modelo: {activa.modelo}</p>}
            {confirmar ? (
              <div role="alertdialog" aria-labelledby="conf-rev" className="aviso">
                <p id="conf-rev">¿Seguro que quieres revocar la key …{activa.ultimos4}? No podrás crear cursos hasta conectar otra.</p>
                <div className="fila">
                  <button type="button" className="boton peligro" onClick={() => revocar(confirmar)} autoFocus>Sí, revocar</button>
                  <button type="button" className="boton secundario" onClick={() => setConfirmar(null)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button type="button" className="boton peligro" onClick={() => setConfirmar(activa)}>Revocar key</button>
            )}
          </div>
        ) : null}
        <form onSubmit={conectar} style={{ marginTop: 16 }}>
          <label htmlFor="api-key">{activa ? "Reemplazar por otra key" : "Pega tu API key de Anthropic"}</label>
          <input id="api-key" type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-…" value={nueva} onChange={(e) => setNueva(e.target.value)} />
          <p className="ayuda-campo">La validamos con una llamada mínima antes de guardarla.</p>
          <p style={{ marginTop: 8 }}><button className="boton" disabled={enviando}>{enviando ? "Validando…" : "Conectar"}</button></p>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
        {aviso && <p className="exito" role="status">{aviso}</p>}
      </section>

      <section className="panel" aria-labelledby="uso">
        <h2 id="uso" style={{ marginTop: 0 }}>Topes y uso de tokens</h2>
        {limites ? (
          <>
            <p>Hoy: <strong>{fmt(limites.usados_hoy)}</strong> de {fmt(limites.tope_diario_tokens)} tokens</p>
            <div className="barra" aria-hidden="true"><span style={{ width: `${Math.min(100, (limites.usados_hoy / Math.max(1, limites.tope_diario_tokens)) * 100)}%` }} /></div>
            <p style={{ marginTop: 8 }}>Este mes: <strong>{fmt(limites.usados_mes)}</strong> de {fmt(limites.tope_mensual_tokens)} tokens</p>
            <div className="barra" aria-hidden="true"><span style={{ width: `${Math.min(100, (limites.usados_mes / Math.max(1, limites.tope_mensual_tokens)) * 100)}%` }} /></div>
            <form onSubmit={guardarTopes} style={{ marginTop: 16 }}>
              <div className="campo">
                <label htmlFor="tope-d">Tope diario (tokens)</label>
                <input id="tope-d" type="number" min={0} step={1000} value={topes.diario} onChange={(e) => setTopes({ ...topes, diario: e.target.value })} />
              </div>
              <div className="campo">
                <label htmlFor="tope-m">Tope mensual (tokens)</label>
                <input id="tope-m" type="number" min={0} step={1000} value={topes.mensual} onChange={(e) => setTopes({ ...topes, mensual: e.target.value })} />
              </div>
              <button className="boton">Guardar topes</button>
            </form>
          </>
        ) : <p>Cargando…</p>}
      </section>

      <AjusteMinimo />
      <AjusteSonido />
      <AjusteAnimaciones />

      <section className="panel oscuro">
        <h2 style={{ marginTop: 0 }}>Cuenta</h2>
        <button type="button" className="boton secundario" onClick={salir}>Cerrar sesión</button>
      </section>
    </>
  );
}
