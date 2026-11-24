// Tipos del contrato HTTP (backend/app/api/CONTRATO.md, v0). snake_case tal cual viaja.

export interface Usuario {
  id: number | string;
  correo: string;
}
export interface UsuarioYo extends Usuario {
  zona_horaria: string;
}
export interface RegistroEntrada {
  correo: string;
  contrasena: string;
  fecha_nacimiento: string; // YYYY-MM-DD
  zona_horaria: string;
}
export interface LoginEntrada {
  correo: string;
  contrasena: string;
}
export interface LoginSalida {
  token: string;
  usuario: Usuario;
}

export interface ApiKey {
  id: number | string;
  proveedor: "anthropic";
  modelo: string | null;
  ultimos4: string;
  estado: "activa" | "invalida";
  creada: string;
}
export interface NuevaKey {
  proveedor: "anthropic";
  api_key: string;
  modelo?: string;
}
export interface LimitesEntrada {
  tope_diario_tokens: number;
  tope_mensual_tokens: number;
}
export interface Limites extends LimitesEntrada {
  usados_hoy: number;
  usados_mes: number;
}

export const TIPOS_PREGUNTA = [
  "multiple_choice",
  "true_false",
  "fill_text",
  "fill_code",
  "numeric",
  "ordering",
  "open",
  "math_problem",
  "proof",
] as const;
export type TipoPregunta = (typeof TIPOS_PREGUNTA)[number];

export type Repaso = "fsrs" | "leitner";

export interface ConfigCurso {
  titulo?: string;
  num_preguntas: number;
  dificultad: number;
  tipos: TipoPregunta[];
  instrucciones: string;
  tiempos_por_tipo?: Partial<Record<TipoPregunta, number>>;
  repaso: Repaso;
}
export interface CursoCreado {
  curso_id: number | string;
  trabajo_id: number | string;
}

export type EstadoTrabajo =
  | "subiendo"
  | "leyendo"
  | "ocr"
  | "analizando"
  | "generando"
  | "validando"
  | "listo"
  | "error";
export interface Trabajo {
  id: number | string;
  estado: EstadoTrabajo;
  progreso: number;
  mensaje: string;
  error?: string | null;
}

export interface CursoResumen {
  id: number | string;
  titulo: string;
  estado: "borrador" | "publicado";
  tema: string;
  creado: string;
}

export type RespuestaPregunta = number | boolean | string[] | number[] | string;

export interface Pregunta {
  id: number | string;
  tipo: TipoPregunta;
  enunciado: string;
  opciones?: string[] | null;
  respuesta: RespuestaPregunta;
  tolerancia?: number | null;
  explicacion: string;
  pista?: string | null;
  dificultad: number;
  tiempo_s: number;
  fuente_pagina?: number | null;
  valida: boolean;
  problemas: string[];
}
export type PreguntaEditable = Partial<
  Pick<
    Pregunta,
    "enunciado" | "opciones" | "respuesta" | "tolerancia" | "explicacion" | "pista" | "dificultad" | "tiempo_s"
  >
>;

export interface Nivel {
  id: number | string;
  titulo: string;
  orden: number;
  es_calentamiento: boolean;
  preguntas: Pregunta[];
}
export interface Seccion {
  id: number | string;
  titulo: string;
  orden: number;
  niveles: Nivel[];
}
export interface Curso {
  id: number | string;
  titulo: string;
  tema: string;
  estado: "borrador" | "publicado";
  secciones: Seccion[];
}

// ---- Juego ----
export type EstadoNodo = "bloqueado" | "disponible" | "actual" | "completado";
export type TipoNodo = "calentamiento" | "leccion" | "cofre";
export interface NodoCamino {
  id: number | string;
  titulo: string;
  estado: EstadoNodo;
  tipo: TipoNodo;
}
export interface Camino {
  secciones: { id: number | string; titulo: string; niveles: NodoCamino[] }[];
}

/** Pregunta sin respuesta correcta (lo que llega al jugar). */
export type PreguntaJugable = Omit<Pregunta, "respuesta" | "valida" | "problemas" | "explicacion"> & {
  explicacion?: string;
};

export interface IntentoIniciado {
  intento_id: number | string;
  preguntas: PreguntaJugable[];
}

export type Rareza = "comun" | "rara" | "legendaria";
export interface EstadoMascota {
  id: number | string;
  especie: string;
  rareza: Rareza;
  viva: boolean;
  revive_en?: string | null;
  comida: number;
  hambrienta: boolean;
  ayudas_restantes_nivel: number;
}

export interface ResultadoRespuesta {
  correcta: boolean;
  respuesta_correcta: RespuestaPregunta;
  explicacion: string;
  vidas: number;
  mascota: EstadoMascota | null;
  xp_ganada: number;
}

export interface Ayuda {
  tipo_ayuda: string;
  datos: Record<string, unknown>;
}

export interface Item {
  item_id: string;
  nombre: string;
  rareza: Rareza;
  cantidad?: number;
}
export interface Cofre {
  id: number | string;
  tipo?: "normal" | "legendario";
}
export interface FinIntento {
  xp_ganada: number;
  monedas: number;
  drop?: Item | null;
  cofre?: Cofre | null;
  perfecto: boolean;
  vidas: number;
}
export interface CofreAbierto {
  items: Item[];
  monedas: number;
}
export interface ArticuloTienda {
  item_id: string;
  nombre: string;
  rareza: Rareza;
  precio: number;
}
export interface InventarioEntrada {
  item_id: string;
  cantidad: number;
}
export interface Compra {
  monedas: number;
  inventario: InventarioEntrada[];
}
export interface Estado {
  xp_total_por_tema: Record<string, number>;
  tier_por_tema: Record<string, number>;
  xp_color: number;
  paleta_activa: string;
  paletas_desbloqueadas: string[];
  monedas: number;
  escudos: number;
  racha: number;
  vidas: number;
  mascota: EstadoMascota | null;
  inventario: InventarioEntrada[];
}
