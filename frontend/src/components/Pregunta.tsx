import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Ayuda, PreguntaJugable, RespuestaPregunta, ResultadoRespuesta, TipoPregunta } from "../api";

export const ABIERTAS: TipoPregunta[] = ["open", "math_problem", "proof"];

/** Lee las ayudas recibidas en un formato cómodo. */
export function resumirAyudas(ayudas: Ayuda[]) {
  const eliminadas = new Set<number>();
  let revelar: string | null = null;
  let intervalo: [number, number] | null = null;
  const fijos: { posicion: number; indice: number }[] = [];
  let pista: string | null = null;
  for (const a of ayudas) {
    const d = a.datos as Record<string, unknown>;
    if (typeof d.eliminar_opcion === "number") eliminadas.add(d.eliminar_opcion);
    if (typeof d.revelar === "string") revelar = d.revelar;
    if (Array.isArray(d.intervalo)) intervalo = [Number(d.intervalo[0]), Number(d.intervalo[1])];
    if (d.fijar_paso && typeof d.fijar_paso === "object") fijos.push(d.fijar_paso as { posicion: number; indice: number });
    if (typeof d.pista === "string") pista = d.pista;
  }
  return { eliminadas, revelar, intervalo, fijos, pista };
}

interface Props {
  pregunta: PreguntaJugable;
  ayudas?: Ayuda[];
  resultado?: ResultadoRespuesta | null;
  onResponder: (r: RespuestaPregunta) => void;
  enviando?: boolean;
}

export function PreguntaVista({ pregunta, ayudas = [], resultado = null, onResponder, enviando = false }: Props) {
  const ay = useMemo(() => resumirAyudas(ayudas), [ayudas]);
  const bloqueada = !!resultado || enviando;
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => titulo.current?.focus(), [pregunta.id]);

  return (
    <section aria-labelledby={`enun-${pregunta.id}`}>
      <h2 className="sr-only">Pregunta</h2>
      <p id={`enun-${pregunta.id}`} className="enunciado" ref={titulo} tabIndex={-1}>{pregunta.enunciado}</p>
      {ay.pista && <p className="aviso" role="status">Pista de tu mascota: {ay.pista}</p>}
      {pregunta.tipo === "multiple_choice" && (
        <Opciones opciones={pregunta.opciones ?? []} eliminadas={ay.eliminadas} bloqueada={bloqueada}
          correcta={resultado ? (resultado.respuesta_correcta as number) : null} onResponder={(i) => onResponder(i)} />
      )}
      {pregunta.tipo === "true_false" && (
        <Opciones opciones={["Verdadero", "Falso"]} eliminadas={ay.eliminadas} bloqueada={bloqueada}
          correcta={resultado ? (resultado.respuesta_correcta ? 0 : 1) : null} onResponder={(i) => onResponder(i === 0)} />
      )}
      {(pregunta.tipo === "fill_text" || pregunta.tipo === "fill_code") && (
        <Completar codigo={pregunta.tipo === "fill_code"} revelar={ay.revelar} bloqueada={bloqueada} onResponder={onResponder} />
      )}
      {pregunta.tipo === "numeric" && <Numerica intervalo={ay.intervalo} bloqueada={bloqueada} onResponder={onResponder} />}
      {pregunta.tipo === "ordering" && (
        <Ordenar opciones={pregunta.opciones ?? []} fijos={ay.fijos} bloqueada={bloqueada} semilla={String(pregunta.id)} onResponder={onResponder} />
      )}
      {ABIERTAS.includes(pregunta.tipo) && (
        <Abierta explicacion={pregunta.explicacion ?? null} bloqueada={bloqueada} onResponder={onResponder} />
      )}
    </section>
  );
}

function Opciones({ opciones, eliminadas, bloqueada, correcta, onResponder }: {
  opciones: string[]; eliminadas: Set<number>; bloqueada: boolean; correcta: number | null; onResponder: (i: number) => void;
}) {
  const [sel, setSel] = useState<number | null>(null);
  return (
    <>
      <ul className="opciones" role="list">
        {opciones.map((o, i) => {
          const elim = eliminadas.has(i);
          const clase = correcta === null ? "" : i === correcta ? "correcta" : i === sel ? "incorrecta" : "";
          return (
            <li key={i}>
              <button type="button" className={`opcion ${elim ? "eliminada" : ""} ${clase}`} aria-pressed={sel === i}
                disabled={elim || bloqueada} onClick={() => setSel(i)}
                aria-label={elim ? `${o} (descartada por la ayuda)` : undefined}>
                <span className="pix-font" style={{ fontSize: 10, marginRight: 8 }}>{String.fromCharCode(65 + i)}</span>{o}
              </button>
            </li>
          );
        })}
      </ul>
      {!bloqueada && (
        <p style={{ marginTop: 16 }}>
          <button type="button" className="boton" disabled={sel === null} onClick={() => sel !== null && onResponder(sel)}>Responder</button>
        </p>
      )}
    </>
  );
}

function Completar({ codigo, revelar, bloqueada, onResponder }: { codigo: boolean; revelar: string | null; bloqueada: boolean; onResponder: (r: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (v.trim()) onResponder(v.trim()); }}>
      <label htmlFor="resp-completar">Tu respuesta</label>
      <input id="resp-completar" type="text" value={v} onChange={(e) => setV(e.target.value)} disabled={bloqueada}
        autoComplete="off" spellCheck={!codigo} style={codigo ? { fontFamily: "ui-monospace, monospace" } : undefined} />
      {revelar && <p className="ayuda-campo" role="status">Ayuda: empieza por «{revelar}»</p>}
      {!bloqueada && <p style={{ marginTop: 12 }}><button className="boton" disabled={!v.trim()}>Responder</button></p>}
    </form>
  );
}

function Numerica({ intervalo, bloqueada, onResponder }: { intervalo: [number, number] | null; bloqueada: boolean; onResponder: (r: number) => void }) {
  const [v, setV] = useState("");
  const n = Number(v.replace(",", "."));
  const okNum = v.trim() !== "" && Number.isFinite(n);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (okNum) onResponder(n); }}>
      <label htmlFor="resp-num">Tu respuesta (número)</label>
      <input id="resp-num" type="text" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} disabled={bloqueada} autoComplete="off" />
      {intervalo && <p className="ayuda-campo" role="status">Ayuda: está entre {intervalo[0]} y {intervalo[1]}</p>}
      {!bloqueada && <p style={{ marginTop: 12 }}><button className="boton" disabled={!okNum}>Responder</button></p>}
    </form>
  );
}

function barajar(n: number, semilla: string): number[] {
  let h = 0;
  for (const c of semilla) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) >>> 0;
    const j = h % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (n > 1 && a.every((x, i) => x === i)) a.reverse();
  return a;
}

export function Ordenar({ opciones, fijos, bloqueada, semilla, onResponder }: {
  opciones: string[]; fijos: { posicion: number; indice: number }[]; bloqueada: boolean; semilla: string; onResponder: (r: number[]) => void;
}) {
  const [orden, setOrden] = useState(() => barajar(opciones.length, semilla));
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const posFijas = new Set(fijos.map((f) => f.posicion));

  useEffect(() => {
    if (!fijos.length) return;
    setOrden((o) => {
      const n = [...o];
      for (const f of fijos) {
        const actual = n.indexOf(f.indice);
        if (actual >= 0 && actual !== f.posicion) [n[actual], n[f.posicion]] = [n[f.posicion], n[actual]];
      }
      return n;
    });
  }, [fijos]);

  const mover = (de: number, a: number) => {
    if (a < 0 || a >= orden.length || de === a || posFijas.has(de) || posFijas.has(a) || bloqueada) return;
    const n = [...orden];
    const [x] = n.splice(de, 1);
    n.splice(a, 0, x);
    setOrden(n);
    setAnuncio(`«${opciones[x]}» movido a la posición ${a + 1}`);
  };
  const tecla = (e: KeyboardEvent, i: number) => {
    if (e.key === "ArrowUp" && e.altKey) { e.preventDefault(); mover(i, i - 1); }
    if (e.key === "ArrowDown" && e.altKey) { e.preventDefault(); mover(i, i + 1); }
  };

  return (
    <>
      <p className="ayuda-campo" id="ordenar-instr">Arrastra los pasos o usa los botones ▲▼ (también Alt + flechas) para ordenarlos.</p>
      <ol className="orden-lista" aria-describedby="ordenar-instr">
        {orden.map((idx, i) => (
          <li key={idx} className={`orden-item ${arrastrando === i ? "arrastrando" : ""} ${posFijas.has(i) ? "fijo" : ""}`}
            draggable={!bloqueada && !posFijas.has(i)}
            onDragStart={() => setArrastrando(i)} onDragEnd={() => setArrastrando(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (arrastrando !== null) mover(arrastrando, i); setArrastrando(null); }}
            onKeyDown={(e) => tecla(e, i)} data-testid="paso">
            <span className="num">{i + 1}</span>
            <span className="texto">{opciones[idx]}{posFijas.has(i) ? " (fijado por la ayuda)" : ""}</span>
            <button type="button" className="boton chico secundario" aria-label={`Subir «${opciones[idx]}»`} disabled={bloqueada || i === 0 || posFijas.has(i)} onClick={() => mover(i, i - 1)}>▲</button>
            <button type="button" className="boton chico secundario" aria-label={`Bajar «${opciones[idx]}»`} disabled={bloqueada || i === orden.length - 1 || posFijas.has(i)} onClick={() => mover(i, i + 1)}>▼</button>
          </li>
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">{anuncio}</p>
      {!bloqueada && <p style={{ marginTop: 16 }}><button type="button" className="boton" onClick={() => onResponder(orden)}>Responder</button></p>}
    </>
  );
}

function Abierta({ explicacion, bloqueada, onResponder }: { explicacion: string | null; bloqueada: boolean; onResponder: (r: boolean) => void }) {
  const [texto, setTexto] = useState("");
  const [visto, setVisto] = useState(false);
  return (
    <div>
      <label htmlFor="resp-abierta">Tu respuesta (para ti; no se corrige sola)</label>
      <textarea id="resp-abierta" value={texto} onChange={(e) => setTexto(e.target.value)} disabled={visto || bloqueada} rows={6} />
      {!visto ? (
        <p style={{ marginTop: 12 }}><button type="button" className="boton" onClick={() => setVisto(true)}>Ver explicación</button></p>
      ) : (
        <div className="panel oscuro" style={{ marginTop: 12 }}>
          <h3>Explicación</h3>
          <p>{explicacion ?? "La explicación de referencia aparecerá al confirmar tu autoevaluación."}</p>
          {!bloqueada && (
            <>
              <p>Compárala con tu respuesta. ¿La tenías bien?</p>
              <div className="fila">
                <button type="button" className="boton" onClick={() => onResponder(true)}>Sí, la tenía bien</button>
                <button type="button" className="boton secundario" onClick={() => onResponder(false)}>No, me equivoqué</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
