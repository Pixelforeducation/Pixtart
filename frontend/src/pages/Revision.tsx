import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Curso, Pregunta } from "../api";
import { useApi } from "../contexto";
import { EditorPregunta } from "../components/EditorPregunta";
import { mensajeError } from "../lib/validacion";

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Revision() {
  const api = useApi();
  const { id = "" } = useParams();
  const [curso, setCurso] = useState<Curso | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);

  const cargar = useCallback(() => api.curso(id).then(setCurso).catch((e) => setError(mensajeError(e))), [api, id]);
  useEffect(() => { void cargar(); }, [cargar]);

  const reemplazar = (q: Pregunta) =>
    setCurso((c) => c && { ...c, secciones: c.secciones.map((s) => ({ ...s, niveles: s.niveles.map((n) => ({ ...n, preguntas: n.preguntas.map((x) => (x.id === q.id ? q : x)) })) })) });
  const quitar = (pid: Pregunta["id"]) =>
    setCurso((c) => c && { ...c, secciones: c.secciones.map((s) => ({ ...s, niveles: s.niveles.map((n) => ({ ...n, preguntas: n.preguntas.filter((x) => x.id !== pid) })) })) });

  const regenerar = async (pid: Pregunta["id"], instruccion: string) => {
    const { trabajo_id } = await api.regenerarPregunta(id, pid, instruccion || undefined);
    for (let i = 0; i < 90; i++) {
      const t = await api.trabajo(trabajo_id);
      if (t.estado === "listo") break;
      if (t.estado === "error") throw new Error(t.error || "No se pudo regenerar la pregunta.");
      await espera(2000);
    }
    await cargar();
  };

  const publicar = async () => {
    setPublicando(true); setError(null);
    try {
      await api.publicar(id);
      setCurso((c) => c && { ...c, estado: "publicado" });
      setAviso("¡Curso publicado! Ya puedes jugarlo desde Inicio.");
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setPublicando(false);
    }
  };

  if (!curso) return <>{error ? <p className="error" role="alert">{error}</p> : <p>Cargando curso…</p>}</>;

  const todas = curso.secciones.flatMap((s) => s.niveles.flatMap((n) => n.preguntas));
  const invalidas = todas.filter((q) => !q.valida).length;

  return (
    <>
      <h1>Revisar: {curso.titulo}</h1>
      <p>{todas.length} preguntas · estado: <strong>{curso.estado}</strong></p>
      <div className="panel oscuro" style={{ position: "sticky", top: 60, zIndex: 5 }}>
        <div className="fila">
          <button type="button" className="boton" onClick={publicar} disabled={invalidas > 0 || publicando || curso.estado === "publicado"}
            aria-describedby="motivo-publicar">
            {curso.estado === "publicado" ? "Publicado" : publicando ? "Publicando…" : "Publicar"}
          </button>
          {curso.estado === "publicado" && <Link to={`/?curso=${curso.id}`} className="boton secundario">Jugar</Link>}
        </div>
        <p id="motivo-publicar" className="ayuda-campo">
          {invalidas > 0
            ? `No puedes publicar todavía: ${invalidas} pregunta${invalidas > 1 ? "s no pasan" : " no pasa"} la validación. Edítalas, regénéralas o bórralas (están marcadas en rojo).`
            : curso.estado === "publicado" ? "El curso es privado: solo tú lo ves." : "Todas las preguntas pasan la validación."}
        </p>
        {error && <p className="error" role="alert">{error}</p>}
        {aviso && <p className="exito" role="status">{aviso}</p>}
      </div>
      <div className="arbol">
        {curso.secciones.map((s) => (
          <details key={s.id} open>
            <summary className="pix-font" style={{ fontSize: 11 }}>Sección {s.orden}: {s.titulo}</summary>
            {s.niveles.map((n) => {
              const malas = n.preguntas.filter((q) => !q.valida).length;
              return (
                <details key={n.id} open={malas > 0} style={{ marginLeft: 12 }}>
                  <summary>Nivel {n.orden}: {n.titulo}{n.es_calentamiento ? " (calentamiento)" : ""} · {n.preguntas.length} preguntas
                    {malas > 0 && <span className="etiqueta mala">{malas} con problemas</span>}</summary>
                  {n.preguntas.map((q) => (
                    <EditorPregunta key={`${q.id}:${JSON.stringify(q)}`} pregunta={q}
                      onGuardar={async (c) => reemplazar(await api.editarPregunta(id, q.id, c))}
                      onBorrar={async () => { await api.borrarPregunta(id, q.id); quitar(q.id); }}
                      onRegenerar={(instr) => regenerar(q.id, instr)} />
                  ))}
                </details>
              );
            })}
          </details>
        ))}
      </div>
    </>
  );
}
