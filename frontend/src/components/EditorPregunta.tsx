import { useState, type FormEvent } from "react";
import type { Pregunta, PreguntaEditable } from "../api";
import { NOMBRE_TIPO } from "../lib/textos";
import { mensajeError } from "../lib/validacion";
import { ABIERTAS } from "./Pregunta";

interface Props {
  pregunta: Pregunta;
  onGuardar: (cambios: PreguntaEditable) => Promise<void>;
  onBorrar: () => Promise<void>;
  onRegenerar: (instruccion: string) => Promise<void>;
}

function resumenRespuesta(p: Pregunta): string {
  switch (p.tipo) {
    case "multiple_choice": return p.opciones?.[p.respuesta as number] ?? `opción ${Number(p.respuesta) + 1} (no existe)`;
    case "true_false": return p.respuesta ? "Verdadero" : "Falso";
    case "fill_text": case "fill_code": return (p.respuesta as string[]).join(" · ");
    case "numeric": return `${p.respuesta}${p.tolerancia ? ` ± ${p.tolerancia}` : ""}`;
    case "ordering": return (p.respuesta as number[]).map((i) => p.opciones?.[i]).join(" → ");
    default: return String(p.respuesta);
  }
}

export function EditorPregunta({ pregunta: p, onGuardar, onBorrar, onRegenerar }: Props) {
  const [modo, setModo] = useState<"ver" | "editar" | "borrar" | "regenerar">("ver");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [enunciado, setEnunciado] = useState(p.enunciado);
  const [opciones, setOpciones] = useState<string[]>(
    p.tipo === "ordering" ? ((p.respuesta as number[]) ?? []).map((i) => p.opciones?.[i] ?? "") : p.opciones ?? [],
  );
  const [correctaMC, setCorrectaMC] = useState<number>(typeof p.respuesta === "number" ? p.respuesta : 0);
  const [vf, setVf] = useState<boolean>(p.respuesta === true);
  const [aceptadas, setAceptadas] = useState(Array.isArray(p.respuesta) ? (p.respuesta as string[]).join("\n") : "");
  const [num, setNum] = useState(String(p.tipo === "numeric" ? p.respuesta : ""));
  const [tol, setTol] = useState(String(p.tolerancia ?? 0));
  const [referencia, setReferencia] = useState(typeof p.respuesta === "string" ? p.respuesta : "");
  const [explicacion, setExplicacion] = useState(p.explicacion);
  const [pista, setPista] = useState(p.pista ?? "");
  const [tiempo, setTiempo] = useState(String(p.tiempo_s));
  const [instruccion, setInstruccion] = useState("");
  const pre = `ed-${p.id}`;

  const construir = (): PreguntaEditable | string => {
    if (!enunciado.trim()) return "El enunciado no puede quedar vacío.";
    const t = Number(tiempo);
    if (!(t >= 5 && t <= 3600)) return "El tiempo debe estar entre 5 y 3600 segundos.";
    const c: PreguntaEditable = { enunciado: enunciado.trim(), explicacion: explicacion.trim(), pista: pista.trim() || null, tiempo_s: Math.round(t) };
    if (p.tipo === "multiple_choice") {
      const ops = opciones.map((o) => o.trim());
      if (ops.length < 2 || ops.some((o) => !o)) return "Necesitas al menos 2 opciones y ninguna vacía.";
      if (correctaMC < 0 || correctaMC >= ops.length) return "Marca la opción correcta.";
      c.opciones = ops; c.respuesta = correctaMC;
    } else if (p.tipo === "true_false") c.respuesta = vf;
    else if (p.tipo === "fill_text" || p.tipo === "fill_code") {
      const a = aceptadas.split("\n").map((x) => x.trim()).filter(Boolean);
      if (!a.length) return "Escribe al menos una respuesta aceptada.";
      c.respuesta = a;
    } else if (p.tipo === "numeric") {
      const n = Number(num.replace(",", ".")), tt = Number(tol.replace(",", "."));
      if (!Number.isFinite(n) || num.trim() === "") return "La respuesta debe ser un número.";
      if (!(tt >= 0)) return "La tolerancia debe ser 0 o más.";
      c.respuesta = n; c.tolerancia = tt;
    } else if (p.tipo === "ordering") {
      const ops = opciones.map((o) => o.trim());
      if (ops.length < 2 || ops.some((o) => !o)) return "Necesitas al menos 2 pasos y ninguno vacío.";
      c.opciones = ops; c.respuesta = ops.map((_, i) => i);
    } else {
      if (!referencia.trim()) return "Escribe la respuesta de referencia.";
      c.respuesta = referencia.trim();
    }
    return c;
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const c = construir();
    if (typeof c === "string") return setError(c);
    setError(null); setOcupado(true);
    try { await onGuardar(c); setModo("ver"); } catch (err) { setError(mensajeError(err)); } finally { setOcupado(false); }
  };
  const ejecutar = async (f: () => Promise<void>) => {
    setError(null); setOcupado(true);
    try { await f(); setModo("ver"); } catch (err) { setError(mensajeError(err)); } finally { setOcupado(false); }
  };

  return (
    <article className={`pregunta-rev ${p.valida ? "" : "invalida"}`} aria-label={`Pregunta: ${p.enunciado}`}>
      <div className="fila">
        <span className="etiqueta">{NOMBRE_TIPO[p.tipo]}</span>
        <span className="etiqueta">{p.tiempo_s} s</span>
        {p.fuente_pagina ? <span className="etiqueta">pág. {p.fuente_pagina}</span> : null}
        {!p.valida && <span className="etiqueta mala">No pasa la validación</span>}
      </div>
      {!p.valida && p.problemas.length > 0 && (
        <ul className="error" aria-label="Problemas detectados">
          {p.problemas.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      )}
      {modo !== "editar" ? (
        <>
          <p style={{ marginTop: 8 }}><strong>{p.enunciado}</strong></p>
          {p.opciones && p.tipo === "multiple_choice" && <ol type="A">{p.opciones.map((o, i) => <li key={i}>{o}</li>)}</ol>}
          <p>Respuesta: {resumenRespuesta(p)}</p>
          <p className="ayuda-campo">Explicación: {p.explicacion}</p>
          {p.pista && <p className="ayuda-campo">Pista: {p.pista}</p>}
        </>
      ) : (
        <form onSubmit={guardar} style={{ marginTop: 8 }}>
          <div className="campo"><label htmlFor={`${pre}-enun`}>Enunciado</label>
            <textarea id={`${pre}-enun`} value={enunciado} onChange={(e) => setEnunciado(e.target.value)} /></div>
          {(p.tipo === "multiple_choice" || p.tipo === "ordering") && (
            <fieldset>
              <legend>{p.tipo === "ordering" ? "Pasos en el orden correcto" : "Opciones (marca la correcta)"}</legend>
              {opciones.map((o, i) => (
                <div className="fila" key={i} style={{ flexWrap: "nowrap", marginBottom: 6 }}>
                  {p.tipo === "multiple_choice" && (
                    <input type="radio" name={`${pre}-ok`} aria-label={`Opción ${i + 1} es la correcta`} checked={correctaMC === i} onChange={() => setCorrectaMC(i)} />
                  )}
                  <label htmlFor={`${pre}-op-${i}`} className="sr-only">{p.tipo === "ordering" ? "Paso" : "Opción"} {i + 1}</label>
                  <input id={`${pre}-op-${i}`} type="text" value={o} onChange={(e) => setOpciones(opciones.map((x, j) => (j === i ? e.target.value : x)))} />
                  <button type="button" className="boton chico secundario" aria-label={`Quitar opción ${i + 1}`}
                    onClick={() => { setOpciones(opciones.filter((_, j) => j !== i)); if (correctaMC >= i && correctaMC > 0) setCorrectaMC(correctaMC - 1); }}>✕</button>
                </div>
              ))}
              <button type="button" className="boton chico secundario" onClick={() => setOpciones([...opciones, ""])}>+ Añadir</button>
            </fieldset>
          )}
          {p.tipo === "true_false" && (
            <fieldset><legend>Respuesta correcta</legend>
              <label className="casilla"><input type="radio" name={`${pre}-vf`} checked={vf} onChange={() => setVf(true)} />Verdadero</label>
              <label className="casilla"><input type="radio" name={`${pre}-vf`} checked={!vf} onChange={() => setVf(false)} />Falso</label>
            </fieldset>
          )}
          {(p.tipo === "fill_text" || p.tipo === "fill_code") && (
            <div className="campo"><label htmlFor={`${pre}-acep`}>Respuestas aceptadas (una por línea)</label>
              <textarea id={`${pre}-acep`} value={aceptadas} onChange={(e) => setAceptadas(e.target.value)} /></div>
          )}
          {p.tipo === "numeric" && (
            <div className="fila">
              <div className="campo"><label htmlFor={`${pre}-num`}>Respuesta</label>
                <input id={`${pre}-num`} type="text" inputMode="decimal" value={num} onChange={(e) => setNum(e.target.value)} /></div>
              <div className="campo"><label htmlFor={`${pre}-tol`}>Tolerancia</label>
                <input id={`${pre}-tol`} type="text" inputMode="decimal" value={tol} onChange={(e) => setTol(e.target.value)} /></div>
            </div>
          )}
          {ABIERTAS.includes(p.tipo) && (
            <div className="campo"><label htmlFor={`${pre}-ref`}>Respuesta de referencia</label>
              <textarea id={`${pre}-ref`} value={referencia} onChange={(e) => setReferencia(e.target.value)} /></div>
          )}
          <div className="campo"><label htmlFor={`${pre}-exp`}>Explicación</label>
            <textarea id={`${pre}-exp`} value={explicacion} onChange={(e) => setExplicacion(e.target.value)} /></div>
          <div className="campo"><label htmlFor={`${pre}-pista`}>Pista (opcional)</label>
            <input id={`${pre}-pista`} type="text" value={pista} onChange={(e) => setPista(e.target.value)} /></div>
          <div className="campo"><label htmlFor={`${pre}-t`}>Tiempo (segundos)</label>
            <input id={`${pre}-t`} type="number" min={5} max={3600} value={tiempo} onChange={(e) => setTiempo(e.target.value)} /></div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="fila">
            <button className="boton" disabled={ocupado}>Guardar</button>
            <button type="button" className="boton secundario" onClick={() => { setModo("ver"); setError(null); }}>Cancelar</button>
          </div>
        </form>
      )}
      {modo === "borrar" && (
        <div role="alertdialog" aria-label="Confirmar borrado" className="aviso">
          <p>¿Borrar esta pregunta? No se puede deshacer.</p>
          <div className="fila">
            <button type="button" className="boton peligro" disabled={ocupado} onClick={() => ejecutar(onBorrar)}>Sí, borrar</button>
            <button type="button" className="boton secundario" onClick={() => setModo("ver")}>Cancelar</button>
          </div>
        </div>
      )}
      {modo === "regenerar" && (
        <form className="aviso" onSubmit={(e) => { e.preventDefault(); void ejecutar(() => onRegenerar(instruccion.trim())); }}>
          <label htmlFor={`${pre}-regen`}>Instrucción para regenerar (opcional)</label>
          <input id={`${pre}-regen`} type="text" value={instruccion} onChange={(e) => setInstruccion(e.target.value)} placeholder="Ej.: hazla más difícil" />
          <div className="fila" style={{ marginTop: 8 }}>
            <button className="boton" disabled={ocupado}>{ocupado ? "Regenerando…" : "Regenerar"}</button>
            <button type="button" className="boton secundario" onClick={() => setModo("ver")}>Cancelar</button>
          </div>
        </form>
      )}
      {modo === "ver" && (
        <div className="fila" style={{ marginTop: 8 }}>
          <button type="button" className="boton chico" onClick={() => setModo("editar")}>Editar</button>
          <button type="button" className="boton chico secundario" onClick={() => setModo("regenerar")}>Regenerar</button>
          <button type="button" className="boton chico peligro" onClick={() => setModo("borrar")}>Borrar</button>
        </div>
      )}
      {modo !== "editar" && error && <p className="error" role="alert">{error}</p>}
    </article>
  );
}
