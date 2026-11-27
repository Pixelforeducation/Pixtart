import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
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
  onRevisar?: (respuesta: string, imagen?: File) => Promise<string>;
  enviando?: boolean;
  /** false cuando el enunciado lo muestra otro (p. ej. el globo del anfitrión en la escena). */
  mostrarEnunciado?: boolean;
}

export function PreguntaVista({ pregunta, ayudas = [], resultado = null, onResponder, onRevisar, enviando = false, mostrarEnunciado = true }: Props) {
  const ay = useMemo(() => resumirAyudas(ayudas), [ayudas]);
  const bloqueada = !!resultado || enviando;
  const titulo = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (mostrarEnunciado) titulo.current?.focus(); }, [pregunta.id, mostrarEnunciado]);

  return (
    <section aria-labelledby={`enun-${pregunta.id}`} className="jg-pregunta">
      <h2 className="sr-only">Pregunta</h2>
      {mostrarEnunciado && <p id={`enun-${pregunta.id}`} className="enunciado" ref={titulo} tabIndex={-1}>{pregunta.enunciado}</p>}
      {ay.pista && <p className="aviso jg-pista" role="status">Pista de tu mascota: {ay.pista}</p>}
      {pregunta.tipo === "multiple_choice" && (
        <Opciones opciones={pregunta.opciones ?? []} eliminadas={ay.eliminadas} bloqueada={bloqueada}
          correcta={resultado ? (resultado.respuesta_correcta as number) : null} onResponder={(i) => onResponder(i)} />
      )}
      {pregunta.tipo === "true_false" && (
        <Opciones opciones={["Verdadero", "Falso"]} eliminadas={ay.eliminadas} bloqueada={bloqueada} vf
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
        <Abierta tipo={pregunta.tipo} explicacion={pregunta.explicacion ?? null} bloqueada={bloqueada}
          onResponder={onResponder} onRevisar={onRevisar} />
      )}
    </section>
  );
}

/** ¿La tecla viene de un campo de texto? (entonces no es un atajo). */
export function esEscritura(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

function Opciones({ opciones, eliminadas, bloqueada, correcta, onResponder, vf = false }: {
  opciones: string[]; eliminadas: Set<number>; bloqueada: boolean; correcta: number | null; onResponder: (i: number) => void; vf?: boolean;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const responderBtn = useRef<HTMLButtonElement>(null);
  const vistas = useRef<Set<number>>(new Set(eliminadas));
  // Las opciones recién descartadas por la ayuda se desvanecen con humo (solo la primera vez).
  const [nuevas, setNuevas] = useState<number[]>([]);
  useEffect(() => {
    const n = [...eliminadas].filter((i) => !vistas.current.has(i));
    eliminadas.forEach((i) => vistas.current.add(i));
    if (!n.length) { setNuevas([]); return; }
    setNuevas(n);
    const id = setTimeout(() => setNuevas([]), 1200);
    return () => clearTimeout(id);
  }, [eliminadas]);
  useEffect(() => { if (sel !== null && eliminadas.has(sel)) setSel(null); }, [eliminadas, sel]);

  // Atajos: 1–9 eligen la opción y llevan el foco a «Responder» (Enter confirma).
  useEffect(() => {
    if (bloqueada) return;
    const tecla = (e: globalThis.KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || esEscritura(e.target)) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > opciones.length || eliminadas.has(n - 1)) return;
      e.preventDefault();
      setSel(n - 1);
      setTimeout(() => responderBtn.current?.focus(), 0);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [bloqueada, opciones.length, eliminadas]);

  const conResultado = correcta !== null;
  return (
    <>
      <ul className={`opciones jg-losetas ${vf ? "jg-vf" : ""} ${conResultado ? "jg-resuelta" : ""}`} role="list">
        {opciones.map((o, i) => {
          const elim = eliminadas.has(i);
          const clase = correcta === null ? "" : i === correcta ? "correcta" : i === sel ? "incorrecta" : "jg-apagada";
          return (
            <li key={i} style={{ ["--i" as string]: i }}>
              <button type="button" className={`jg-loseta ${elim ? "eliminada" : ""} ${nuevas.includes(i) ? "jg-humo" : ""} ${clase}`} aria-pressed={sel === i}
                disabled={elim || bloqueada} onClick={() => setSel(i)} aria-keyshortcuts={String(i + 1)}
                aria-label={elim ? `${o} (descartada por la ayuda)` : undefined}>
                <span className="jg-tecla" aria-hidden="true">{i + 1}</span>
                <span className="jg-loseta-txt">{o}</span>
                {clase === "correcta" && <span className="jg-marca jg-marca-bien" aria-hidden="true">✓</span>}
                {clase === "incorrecta" && <span className="jg-marca jg-marca-mal" aria-hidden="true">✗</span>}
                {nuevas.includes(i) && <span className="jg-nube" aria-hidden="true"><i /><i /><i /><i /></span>}
              </button>
            </li>
          );
        })}
      </ul>
      {!bloqueada && (
        <p className="jg-acciones">
          <button ref={responderBtn} type="button" className="boton jg-responder" disabled={sel === null} onClick={() => sel !== null && onResponder(sel)}>Responder</button>
          <span className="jg-pista-teclas" aria-hidden="true">Teclas 1–{opciones.length} y Enter</span>
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
      {!bloqueada && <p className="jg-acciones"><button className="boton jg-responder" disabled={!v.trim()}>Responder</button></p>}
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
      {!bloqueada && <p className="jg-acciones"><button className="boton jg-responder" disabled={!okNum}>Responder</button></p>}
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
      {!bloqueada && <p className="jg-acciones"><button type="button" className="boton jg-responder" onClick={() => onResponder(orden)}>Responder</button></p>}
    </>
  );
}

function Abierta({ tipo, explicacion, bloqueada, onResponder, onRevisar }: {
  tipo: TipoPregunta;
  explicacion: string | null;
  bloqueada: boolean;
  onResponder: (r: boolean) => void;
  onRevisar?: (respuesta: string, imagen?: File) => Promise<string>;
}) {
  const [texto, setTexto] = useState("");
  const [visto, setVisto] = useState(false);
  const [imagen, setImagen] = useState<File | null>(null);
  const [retroalimentacion, setRetroalimentacion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revisando, setRevisando] = useState(false);
  const vistaImagen = useMemo(
    () => imagen && typeof URL.createObjectURL === "function" ? URL.createObjectURL(imagen) : null,
    [imagen],
  );
  useEffect(() => () => { if (vistaImagen) URL.revokeObjectURL(vistaImagen); }, [vistaImagen]);

  const elegirImagen = (archivo: File | undefined) => {
    if (archivo && archivo.size > 5 * 1024 * 1024) {
      setError("La foto no puede superar los 5 MB.");
    } else if (archivo && ["image/jpeg", "image/png", "image/webp"].includes(archivo.type)) {
      setImagen(archivo);
      setError(null);
    } else if (archivo) {
      setError("Usa una imagen JPG, PNG o WebP.");
    }
  };
  const pegarImagen = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (tipo !== "math_problem") return;
    const archivo = Array.from(e.clipboardData.items)
      .find((item) => item.type.startsWith("image/"))?.getAsFile();
    if (archivo) {
      e.preventDefault();
      elegirImagen(archivo);
    }
  };
  const revisar = async () => {
    if (!onRevisar || revisando || (!texto.trim() && !imagen)) return;
    setRevisando(true);
    setError(null);
    try {
      setRetroalimentacion(await onRevisar(texto.trim(), imagen ?? undefined));
      setVisto(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo revisar la respuesta.");
    } finally {
      setRevisando(false);
    }
  };

  return (
    <div className="jg-abierta">
      <label htmlFor="resp-abierta">Escribe tu respuesta o procedimiento</label>
      <textarea id="resp-abierta" value={texto} onChange={(e) => setTexto(e.target.value)}
        onPaste={pegarImagen} disabled={visto || bloqueada || revisando} rows={6}
        maxLength={12000}
        placeholder="Escribe aquí tu respuesta..." />
      {tipo === "math_problem" && !visto && !bloqueada && (
        <div className="jg-foto-acciones">
          <label htmlFor="foto-procedimiento" className="boton secundario jg-foto-boton">
            <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" shapeRendering="crispEdges">
              <path fill="currentColor" d="M2 4h3l1-2h4l1 2h3v10H2z" />
              <path fill="var(--c-madera)" d="M3 5h10v8H3zM7 3h2v1H7z" />
              <path fill="currentColor" d="M6 6h4v1H6zM5 7h1v3H5zM10 7h1v3h-1zM6 10h4v1H6z" />
            </svg>
            Adjuntar foto
          </label>
          <input id="foto-procedimiento" type="file" accept="image/jpeg,image/png,image/webp"
            className="sr-only" onChange={(e) => { elegirImagen(e.target.files?.[0]); e.target.value = ""; }} />
          <span className="ayuda-campo">También puedes pegar una imagen en el recuadro.</span>
        </div>
      )}
      {imagen && vistaImagen && (
        <figure className="jg-foto-vista">
          <img src={vistaImagen} alt="Procedimiento adjunto" />
          {!visto && !bloqueada && <button type="button" className="boton chico secundario"
            onClick={() => setImagen(null)}>Quitar foto</button>}
        </figure>
      )}
      {imagen && !vistaImagen && <p className="ayuda-campo">Foto adjunta: {imagen.name}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {retroalimentacion && (
        <div className="jg-revision-ia" role="status">
          <h3>Revisión de tu procedimiento</h3>
          <p>{retroalimentacion}</p>
        </div>
      )}
      {!visto ? (
        <div className="jg-acciones">
          {onRevisar && <button type="button" className="boton jg-responder"
            disabled={bloqueada || revisando || (!texto.trim() && !imagen)} onClick={() => void revisar()}>
            {revisando ? "Revisando…" : "Enviar para revisión"}
          </button>}
          <button type="button" className="boton secundario" disabled={revisando}
            onClick={() => setVisto(true)}>Ver explicación</button>
        </div>
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
