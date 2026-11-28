import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from "react";

const TIPOS_IMAGEN = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGEN_BYTES = 5 * 1024 * 1024;

function IconoFoto() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="24" height="24" shapeRendering="crispEdges">
      <path fill="currentColor" d="M2 4h3l1-2h4l1 2h3v10H2z" />
      <path fill="var(--c-madera)" d="M3 5h10v8H3zM7 3h2v1H7z" />
      <path fill="currentColor" d="M4 11 6 8l2 2 2-3 3 4z" />
      <path fill="var(--c-moneda)" d="M5 6h2v2H5z" />
    </svg>
  );
}

export function FotoRespuesta({ id, respuesta, bloqueada, onRevisar }: {
  id: string;
  respuesta: string;
  bloqueada: boolean;
  onRevisar?: (respuesta: string, imagen: File) => Promise<string>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [seleccionada, setSeleccionada] = useState<File | null>(null);
  const [adjunta, setAdjunta] = useState<File | null>(null);
  const [retroalimentacion, setRetroalimentacion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const galeria = useRef<HTMLInputElement>(null);
  const camara = useRef<HTMLInputElement>(null);
  const zona = useRef<HTMLDivElement>(null);
  const archivoPreview = seleccionada ?? adjunta;
  const url = useMemo(() => {
    if (!archivoPreview || typeof URL.createObjectURL !== "function") return null;
    return URL.createObjectURL(archivoPreview);
  }, [archivoPreview]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => { if (abierto) zona.current?.focus(); }, [abierto]);

  const seleccionar = (archivo: File | undefined) => {
    if (!archivo) return;
    if (!TIPOS_IMAGEN.includes(archivo.type)) {
      setError("Elige una imagen JPG, PNG o WebP.");
    } else if (archivo.size > MAX_IMAGEN_BYTES) {
      setError("La imagen no puede superar los 5 MB.");
    } else {
      setSeleccionada(archivo);
      setError(null);
    }
  };
  const pegar = (evento: ClipboardEvent<HTMLDivElement>) => {
    const archivo = Array.from(evento.clipboardData.items)
      .find((item) => TIPOS_IMAGEN.includes(item.type))?.getAsFile();
    if (archivo) {
      evento.preventDefault();
      seleccionar(archivo);
    }
  };
  const soltar = (evento: DragEvent<HTMLDivElement>) => {
    evento.preventDefault();
    seleccionar(evento.dataTransfer.files[0]);
  };
  const enviar = async () => {
    if (!seleccionada || enviando) return;
    if (!onRevisar) {
      setError("La revisión de fotos no está disponible en este momento.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      setRetroalimentacion(await onRevisar(respuesta.trim(), seleccionada));
      setAdjunta(seleccionada);
      setSeleccionada(null);
      setAbierto(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar la imagen.");
    } finally {
      setEnviando(false);
    }
  };
  const cerrar = () => {
    setAbierto(false);
    setSeleccionada(null);
    setError(null);
  };

  return (
    <div className="jg-adjunta">
      <button type="button" className="jg-foto-vacio" disabled={bloqueada}
        onClick={() => setAbierto(true)} aria-label={adjunta ? "Cambiar foto adjunta" : "Agregar foto"}>
        {adjunta && url ? <img src={url} alt="" /> : <IconoFoto />}
        <span>{adjunta ? "Cambiar foto" : "Agregar foto"}</span>
      </button>
      {retroalimentacion && (
        <div className="jg-revision-ia" role="status">
          <h3>Revisión de tu respuesta</h3>
          <p>{retroalimentacion}</p>
        </div>
      )}
      {abierto && (
        <div className="jg-foto-capa">
          <section className="jg-foto-dialogo" role="dialog" aria-modal="true" aria-labelledby={`${id}-titulo`}>
            <h2 id={`${id}-titulo`}>Adjuntar foto</h2>
            <button type="button" className="boton chico secundario jg-foto-cerrar" aria-label="Cerrar"
              onClick={cerrar}>✕</button>
            <div ref={zona} className="jg-foto-zona" tabIndex={0} onPaste={pegar}
              onDragOver={(e) => e.preventDefault()} onDrop={soltar}>
              {seleccionada && url
                ? <img className="jg-foto-preview" src={url} alt="Vista previa de la foto" />
                : <><IconoFoto /><p>Pega, arrastra o selecciona una imagen</p></>}
            </div>
            <input ref={galeria} type="file" accept={TIPOS_IMAGEN.join(",")} className="sr-only"
              onChange={(e) => { seleccionar(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} />
            <input ref={camara} type="file" accept={TIPOS_IMAGEN.join(",")} capture="environment"
              className="sr-only" onChange={(e) => { seleccionar(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} />
            {error && <p className="error" role="alert">{error}</p>}
            <div className="jg-foto-botones">
              {!seleccionada ? (
                <>
                  <button type="button" className="boton" onClick={() => galeria.current?.click()}>Elegir foto</button>
                  <button type="button" className="boton secundario" onClick={() => camara.current?.click()}>Tomar foto</button>
                </>
              ) : (
                <>
                  <button type="button" className="boton" disabled={enviando} onClick={() => void enviar()}>
                    {enviando ? "Enviando…" : "Enviar foto"}
                  </button>
                  <button type="button" className="boton secundario" disabled={enviando}
                    onClick={() => { setSeleccionada(null); setError(null); camara.current?.click(); }}>Volver a tomar</button>
                </>
              )}
              <button type="button" className="boton secundario" disabled={enviando} onClick={cerrar}>Cerrar</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
