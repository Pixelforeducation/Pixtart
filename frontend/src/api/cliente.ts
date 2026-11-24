import { guardarToken, obtenerToken } from "./sesion";
import type * as T from "./tipos";

type Id = number | string;

/** Interfaz única de la API; la implementan el cliente HTTP y el mock. */
export interface Api {
  registro(e: T.RegistroEntrada): Promise<T.Usuario>;
  login(e: T.LoginEntrada): Promise<T.LoginSalida>;
  yo(): Promise<T.UsuarioYo>;

  listarKeys(): Promise<T.ApiKey[]>;
  crearKey(e: T.NuevaKey): Promise<T.ApiKey>;
  borrarKey(id: Id): Promise<void>;
  obtenerLimites(): Promise<T.Limites>;
  guardarLimites(e: T.LimitesEntrada): Promise<T.Limites>;

  /** 1 a 10 PDFs; se envían con el campo multipart `pdf` repetido. */
  crearCurso(pdfs: File[], config: T.ConfigCurso): Promise<T.CursoCreado>;
  trabajo(id: Id): Promise<T.Trabajo>;
  listarCursos(): Promise<T.CursoResumen[]>;
  curso(id: Id): Promise<T.Curso>;
  editarPregunta(cursoId: Id, pid: Id, cambios: T.PreguntaEditable): Promise<T.Pregunta>;
  borrarPregunta(cursoId: Id, pid: Id): Promise<void>;
  regenerarPregunta(cursoId: Id, pid: Id, instruccion?: string): Promise<{ trabajo_id: Id }>;
  publicar(cursoId: Id): Promise<{ id: Id; estado: "publicado" }>;

  estado(): Promise<T.Estado>;
  camino(cursoId: Id): Promise<T.Camino>;
  iniciarNivel(nivelId: Id): Promise<T.IntentoIniciado>;
  responder(intentoId: Id, e: { pregunta_id: Id; respuesta: T.RespuestaPregunta | null; tiempo_ms: number }): Promise<T.ResultadoRespuesta>;
  ayuda(intentoId: Id, preguntaId: Id): Promise<T.Ayuda>;
  terminar(intentoId: Id): Promise<T.FinIntento>;
  abrirCofre(id: Id): Promise<T.CofreAbierto>;
  tienda(): Promise<T.ArticuloTienda[]>;
  comprar(itemId: string): Promise<T.Compra>;
  usarItem(itemId: string): Promise<T.Estado>;
  equiparMascota(mascotaId: Id): Promise<T.Estado>;
  /** NO está en CONTRATO v0: se supone `POST /juego/paleta {paleta_id}` → Estado. */
  elegirPaleta(paletaId: string): Promise<T.Estado>;
}

export class ErrorApi extends Error {
  constructor(public estado: number, mensaje: string) {
    super(mensaje);
    this.name = "ErrorApi";
  }
}

function mensajeDeDetalle(detalle: unknown, estado: number): string {
  if (typeof detalle === "string") return detalle;
  if (Array.isArray(detalle) && detalle.length && typeof detalle[0]?.msg === "string") {
    return detalle.map((d) => d.msg).join(" · ");
  }
  return `Error ${estado}. Inténtalo de nuevo.`;
}

async function pedir<R>(metodo: string, ruta: string, cuerpo?: unknown): Promise<R> {
  const cabeceras: Record<string, string> = {};
  const token = obtenerToken();
  if (token) cabeceras.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (cuerpo instanceof FormData) body = cuerpo;
  else if (cuerpo !== undefined) {
    cabeceras["Content-Type"] = "application/json";
    body = JSON.stringify(cuerpo);
  }
  let res: Response;
  try {
    res = await fetch(`/api${ruta}`, { method: metodo, headers: cabeceras, body });
  } catch {
    throw new ErrorApi(0, "No hay conexión con el servidor.");
  }
  if (res.status === 401 && token) guardarToken(null);
  if (res.status === 204) return undefined as R;
  const texto = await res.text();
  const datos = texto ? JSON.parse(texto) : undefined;
  if (!res.ok) throw new ErrorApi(res.status, mensajeDeDetalle(datos?.detail, res.status));
  return datos as R;
}

export const apiHttp: Api = {
  registro: (e) => pedir("POST", "/auth/registro", e),
  login: (e) => pedir("POST", "/auth/login", e),
  yo: () => pedir("GET", "/auth/yo"),

  listarKeys: () => pedir("GET", "/keys"),
  crearKey: (e) => pedir("POST", "/keys", e),
  borrarKey: (id) => pedir("DELETE", `/keys/${id}`),
  obtenerLimites: () => pedir("GET", "/keys/limites"),
  guardarLimites: (e) => pedir("PUT", "/keys/limites", e),

  crearCurso: (pdfs, config) => {
    const fd = new FormData();
    for (const pdf of pdfs) fd.append("pdf", pdf, pdf.name);
    fd.append("config", JSON.stringify(config));
    return pedir("POST", "/cursos", fd);
  },
  trabajo: (id) => pedir("GET", `/trabajos/${id}`),
  listarCursos: () => pedir("GET", "/cursos"),
  curso: (id) => pedir("GET", `/cursos/${id}`),
  editarPregunta: (c, p, cambios) => pedir("PATCH", `/cursos/${c}/preguntas/${p}`, cambios),
  borrarPregunta: (c, p) => pedir("DELETE", `/cursos/${c}/preguntas/${p}`),
  regenerarPregunta: (c, p, instruccion) =>
    pedir("POST", `/cursos/${c}/preguntas/${p}/regenerar`, instruccion ? { instruccion } : {}),
  publicar: (c) => pedir("POST", `/cursos/${c}/publicar`),

  estado: () => pedir("GET", "/juego/estado"),
  camino: (c) => pedir("GET", `/juego/cursos/${c}/camino`),
  iniciarNivel: (n) => pedir("POST", `/juego/niveles/${n}/iniciar`),
  responder: (i, e) => pedir("POST", `/juego/intentos/${i}/responder`, e),
  ayuda: (i, p) => pedir("POST", `/juego/intentos/${i}/ayuda`, { pregunta_id: p }),
  terminar: (i) => pedir("POST", `/juego/intentos/${i}/terminar`),
  abrirCofre: (id) => pedir("POST", `/juego/cofres/${id}/abrir`),
  tienda: () => pedir("GET", "/juego/tienda"),
  comprar: (item_id) => pedir("POST", "/juego/tienda/comprar", { item_id }),
  usarItem: (item_id) => pedir("POST", "/juego/items/usar", { item_id }),
  equiparMascota: (mascota_id) => pedir("POST", "/juego/mascotas/equipar", { mascota_id }),
  elegirPaleta: (paleta_id) => pedir("POST", "/juego/paleta", { paleta_id }),
};
