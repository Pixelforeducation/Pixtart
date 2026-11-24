import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Ayuda, CofreAbierto, EstadoMascota, FinIntento, IntentoIniciado, RespuestaPregunta, ResultadoRespuesta, TipoPregunta } from "../api";
import { useApi, useEstadoJuego } from "../contexto";
import { Corazones } from "../components/Corazones";
import { Mascota } from "../components/Mascota";
import { ABIERTAS, PreguntaVista } from "../components/Pregunta";
import { Temporizador } from "../components/Temporizador";
import { Moneda } from "../components/Iconos";
import { Sprite } from "../components/Sprite";
import { mensajeError } from "../lib/validacion";

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
  const inicio = useRef(Date.now());
  const siguienteBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (estado) { setVidas(estado.vidas); setMascota(estado.mascota); }
  }, [estado]);

  useEffect(() => {
    let vivo = true;
    setIntento(null); setIdx(0); setResultado(null); setAyudas([]); setFin(null); setCofre(null); setXp(0); setError(null);
    api.iniciarNivel(nivelId).then((r) => { if (vivo) { setIntento(r); inicio.current = Date.now(); } }).catch((e) => vivo && setError(mensajeError(e)));
    if (cursoId) {
      api.camino(cursoId).then((c) => {
        const n = c.secciones.flatMap((s) => s.niveles).find((x) => String(x.id) === nivelId);
        if (vivo) setCalentamiento(n?.tipo === "calentamiento");
      }).catch(() => {});
    }
    void refrescar();
    return () => { vivo = false; };
  }, [api, nivelId, cursoId, refrescar]);

  const pregunta = intento?.preguntas[idx];

  const responder = useCallback(async (r: RespuestaPregunta | null) => {
    if (!intento || !pregunta || resultado || enviando) return;
    setEnviando(true);
    try {
      const res = await api.responder(intento.intento_id, { pregunta_id: pregunta.id, respuesta: r, tiempo_ms: Date.now() - inicio.current });
      setResultado(res);
      setVidas(res.vidas);
      setMascota(res.mascota);
      setXp((x) => x + res.xp_ganada);
      setTimeout(() => siguienteBtn.current?.focus(), 0);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setEnviando(false);
    }
  }, [api, intento, pregunta, resultado, enviando]);

  const pedirAyuda = async () => {
    if (!intento || !pregunta) return;
    try {
      const a = await api.ayuda(intento.intento_id, pregunta.id);
      setAyudas((x) => [...x, a]);
      setMascota((m) => m && { ...m, ayudas_restantes_nivel: Math.max(0, m.ayudas_restantes_nivel - 1), comida: Math.max(0, m.comida - 1) });
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  const siguiente = async () => {
    if (!intento) return;
    if (idx + 1 < intento.preguntas.length) {
      setIdx(idx + 1); setResultado(null); setAyudas([]); setError(null);
      inicio.current = Date.now();
      return;
    }
    try {
      setFin(await api.terminar(intento.intento_id));
      void refrescar();
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  const siguienteNivel = async () => {
    if (!cursoId) return nav("/");
    try {
      const c = await api.camino(cursoId);
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

  const volver = cursoId ? `/?curso=${cursoId}` : "/";

  if (error && !intento) return <><p className="error" role="alert">{error}</p><Link to={volver} className="boton secundario">Volver al camino</Link></>;
  if (!intento) return <p>Preparando el nivel…</p>;

  if (fin) {
    return (
      <section className="panel centro transicion" aria-labelledby="fin-tit">
        <h1 id="fin-tit">{fin.perfecto ? "¡Nivel perfecto!" : "¡Nivel completado!"}</h1>
        <p className="grande">+{fin.xp_ganada} XP</p>
        <p className="fila" style={{ justifyContent: "center" }}><Moneda tam={22} /> +{fin.monedas} monedas</p>
        <p><Corazones vidas={fin.vidas} /></p>
        {fin.drop && <p className="exito">Encontraste: <strong>{fin.drop.nombre}</strong> ({fin.drop.rareza})</p>}
        {fin.cofre && !cofre && (
          <div>
            <Sprite src={fin.cofre.tipo === "legendario" ? "/sprites/chest-legendary.svg" : "/sprites/chest-normal.svg"} alt="Cofre" tam={96} />
            <p><button className="boton" onClick={abrirCofre}>Abrir cofre</button></p>
          </div>
        )}
        {cofre && <p className="exito">El cofre tenía +{cofre.monedas} monedas{cofre.items.length ? ` y ${cofre.items.map((i) => i.nombre).join(", ")}` : ""}.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="fila" style={{ justifyContent: "center", marginTop: 16 }}>
          <button className="boton" onClick={siguienteNivel} autoFocus>Siguiente nivel ▶</button>
          <Link to={volver} className="boton secundario">Volver al camino</Link>
        </div>
      </section>
    );
  }

  if (!pregunta) return <p>Este nivel no tiene preguntas. <Link to={volver}>Volver</Link></p>;

  return (
    <>
      <div className="hud" role="region" aria-label="Estado del nivel">
        <Corazones vidas={vidas} />
        <span>{idx + 1}/{intento.preguntas.length}</span>
        <span>XP +{xp}</span>
        <Temporizador segundos={pregunta.tiempo_s} activo={!resultado && !enviando} clave={pregunta.id} onAgotado={() => responder(null)} />
      </div>
      {calentamiento && <p className="aviso">Calentamiento: aquí los errores no cuestan vidas.</p>}
      <div className="panel oscuro">
        <Mascota mascota={mascota} onAyuda={resultado ? undefined : pedirAyuda} ayudaPosible={ayudaPermitida(mascota, pregunta.tipo)} onRevive={refrescar} />
      </div>
      <div className="panel transicion" key={pregunta.id}>
        <PreguntaVista pregunta={pregunta} ayudas={ayudas} resultado={resultado} onResponder={responder} enviando={enviando} />
        {resultado && (
          <div className={`feedback ${resultado.correcta ? "bien" : "mal"}`} role="status" aria-live="polite">
            <h2>{resultado.correcta ? "¡Correcto!" : "Incorrecto"}</h2>
            {!resultado.correcta && !ABIERTAS.includes(pregunta.tipo) && (
              <p>Respuesta correcta: <strong>{textoRespuesta(resultado.respuesta_correcta, pregunta.opciones, pregunta.tipo)}</strong></p>
            )}
            {ABIERTAS.includes(pregunta.tipo) && typeof resultado.respuesta_correcta === "string" && <p>Referencia: {resultado.respuesta_correcta}</p>}
            <p>{resultado.explicacion}</p>
            {resultado.xp_ganada > 0 && <p>+{resultado.xp_ganada} XP</p>}
            <button ref={siguienteBtn} className="boton" onClick={siguiente}>
              {idx + 1 < intento.preguntas.length ? "Siguiente" : "Terminar nivel"}
            </button>
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      <p><Link to={volver}>Salir al camino</Link></p>
    </>
  );
}
