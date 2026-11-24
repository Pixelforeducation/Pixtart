# Contrato de la API de Pixtart (v0)

Base: `/api`. JSON en `snake_case`. Errores: `{"detail": "<mensaje en español para el usuario>"}`.
Auth: `Authorization: Bearer <jwt>` en todo excepto `/api/salud`, `/api/auth/registro` y `/api/auth/login`.
La dependencia `app.auth.deps.usuario_actual` (agente plataforma) devuelve el `Usuario`. Mientras no exista,
los demás agentes la importan de ese módulo y en sus tests la sustituyen con `app.dependency_overrides`.

## Plataforma (auth, keys)
| Método | Ruta | Entrada | Salida |
|---|---|---|---|
| POST | /auth/registro | `{correo, contrasena, fecha_nacimiento: "YYYY-MM-DD", zona_horaria}` | 201 `{id, correo}`; 422 si es menor de 18 |
| POST | /auth/login | `{correo, contrasena}` | `{token, usuario: {id, correo}}` |
| GET | /auth/yo | — | `{id, correo, zona_horaria}` |
| GET | /keys | — | `[{id, proveedor: "anthropic", modelo, ultimos4, estado: "activa"\|"invalida", creada}]` |
| POST | /keys | `{proveedor: "anthropic", api_key, modelo?}` | 201 igual que arriba; 400 si la validación falla. Se valida con una llamada mínima |
| DELETE | /keys/{id} | — | 204, borra el material cifrado |
| GET/PUT | /keys/limites | `{tope_diario_tokens, tope_mensual_tokens}` | `{tope_diario_tokens, tope_mensual_tokens, usados_hoy, usados_mes}` |

Interfaz interna para otros agentes: `app.keys.service.obtener_key_descifrada(db, usuario_id) -> str | None`
y `app.keys.service.registrar_uso(db, usuario_id, tokens_entrada, tokens_salida) -> None`,
que lanza `LimiteExcedido` si se pasa del tope.

## Cursos desde PDF (pipeline)
| Método | Ruta | Entrada | Salida |
|---|---|---|---|
| POST | /cursos | multipart: `pdf` (≤ 25 MB, ≤ 300 págs) + `config` (JSON, ver abajo) | 202 `{curso_id, trabajo_id}` |
| GET | /trabajos/{id} | — | `{id, estado, progreso: 0-100, mensaje, error?}`; estado ∈ `subiendo, leyendo, ocr, analizando, generando, validando, listo, error` |
| GET | /cursos | — | `[{id, titulo, estado: "borrador"\|"publicado", tema, creado}]` |
| GET | /cursos/{id} | — | `Curso` completo (abajo) |
| PATCH | /cursos/{id}/preguntas/{pid} | campos editables de `Pregunta` | `Pregunta` |
| DELETE | /cursos/{id}/preguntas/{pid} | — | 204 |
| POST | /cursos/{id}/preguntas/{pid}/regenerar | `{instruccion?}` | 202 `{trabajo_id}` |
| POST | /cursos/{id}/publicar | — | `{id, estado: "publicado"}`; 409 si hay preguntas que no pasan la validación |

`config` = `{titulo?, num_preguntas: 5-200, dificultad: 1-5, tipos: [TipoPregunta], instrucciones: str ≤ 2000,
tiempos_por_tipo?: {tipo: segundos}, repaso: "fsrs"|"leitner"}`

`TipoPregunta` ∈ `multiple_choice, true_false, fill_text, fill_code, numeric, ordering, open, math_problem, proof`

`Curso` = `{id, titulo, tema, estado, secciones: [{id, titulo, orden, niveles: [{id, titulo, orden,
es_calentamiento, preguntas: [Pregunta]}]}]}`

`Pregunta` = `{id, tipo, enunciado, opciones?: [str], respuesta: <según tipo>, tolerancia?: number,
explicacion, pista?: str, dificultad: 1-5, tiempo_s, fuente_pagina?: int, valida: bool, problemas: [str]}`

Respuesta por tipo: MC → índice (int); VF → bool; fill_* → `[str]` aceptadas; numeric → number (+ `tolerancia`);
ordering → `[int]` en orden correcto; open/math_problem/proof → texto de referencia (no se corrige solo;
el jugador se autoevalúa con la explicación, o pide feedback con IA).

## Juego (juego-api)
| Método | Ruta | Entrada | Salida |
|---|---|---|---|
| GET | /juego/estado | — | `Estado` (abajo) |
| GET | /juego/cursos/{id}/camino | — | `{secciones: [{id, titulo, niveles: [{id, titulo, estado: "bloqueado"\|"disponible"\|"actual"\|"completado", tipo: "calentamiento"\|"leccion"\|"cofre"}]}]}` |
| POST | /juego/niveles/{id}/iniciar | — | `{intento_id, preguntas: [PreguntaJugable]}` (sin respuesta correcta) |
| POST | /juego/intentos/{id}/responder | `{pregunta_id, respuesta, tiempo_ms}` | `{correcta, respuesta_correcta, explicacion, vidas, mascota: EstadoMascota, xp_ganada}` |
| POST | /juego/intentos/{id}/ayuda | `{pregunta_id}` | `{tipo_ayuda, datos}` (p. ej. `{"eliminar_opcion": 2}`); 409 si no hay ayuda disponible |
| POST | /juego/intentos/{id}/terminar | — | `{xp_ganada, monedas, drop?: Item, cofre?: Cofre, perfecto: bool, vidas}` |
| POST | /juego/cofres/{id}/abrir | — | `{items: [Item], monedas}` |
| GET | /juego/tienda | — | `[{item_id, nombre, rareza, precio}]` |
| POST | /juego/tienda/comprar | `{item_id}` | `{monedas, inventario}` |
| POST | /juego/items/usar | `{item_id}` | `Estado` (botiquín, poción de resurrección, comida, escudo) |
| POST | /juego/mascotas/equipar | `{mascota_id}` | `Estado` |

`Estado` = `{xp_total_por_tema: {tema: int}, tier_por_tema: {tema: int}, xp_color, paleta_activa, paletas_desbloqueadas,
monedas, escudos, racha, vidas, mascota: EstadoMascota | null, inventario: [{item_id, cantidad}]}`

`EstadoMascota` = `{id, especie, rareza: "comun"|"rara"|"legendaria", viva: bool, revive_en?: iso8601,
comida: int, hambrienta: bool, ayudas_restantes_nivel: int}`
