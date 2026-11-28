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
| POST | /cursos | multipart: `pdf` repetido 1–10 veces + `config` (JSON, ver abajo); límites abajo | 202 `{curso_id, trabajo_id}`; 422 (ver «Varios PDFs») |
| GET | /trabajos/{id} | — | `{id, estado, progreso: 0-100, mensaje, error?}`; estado ∈ `subiendo, leyendo, ocr, analizando, generando, validando, listo, error` |
| GET | /cursos | — | `[{id, titulo, estado: "borrador"\|"publicado", tema, creado}]` |
| GET | /cursos/{id} | — | `Curso` completo (abajo) |
| PATCH | /cursos/{id}/preguntas/{pid} | campos editables de `Pregunta` | `Pregunta` |
| DELETE | /cursos/{id}/preguntas/{pid} | — | 204 |
| POST | /cursos/{id}/preguntas/{pid}/regenerar | `{instruccion?}` | 202 `{trabajo_id}` |
| POST | /cursos/{id}/publicar | — | `{id, estado: "publicado"}`; 409 si hay preguntas que no pasan la validación |

**Varios PDFs.** El campo `pdf` puede repetirse (1 a 10 archivos; uno solo sigue valiendo). Cada archivo
≤ 25 MB y con firma `%PDF-`; en total ≤ 100 MB y ≤ 600 páginas. Dos archivos idénticos (mismo sha256) en la
misma petición → 422. Todo 422 de archivos nombra el archivo, p. ej. `"«notas.pdf»: El archivo no es un PDF."`,
`"«copia.pdf» es idéntico a «apuntes.pdf»; quita uno de los dos."`, `"Entre todos los PDFs suman 640 páginas
(«a.pdf» 400, «b.pdf» 240); el máximo total es 600."`. El nombre se sanea (sin ruta ni `<>"'&…`, ≤ 120
caracteres, termina en `.pdf`) y, si dos archivos distintos se llaman igual, el segundo pasa a `x (2).pdf`.
Se guarda un `Documento` por archivo (nombre, sha256, páginas, `borrado_en`); todos se borran del almacén al
terminar el trabajo (`listo` o `error`). `GET /trabajos/{id}.mensaje` informa por archivo:
`"Leyendo apuntes.pdf (2 de 3)…"`. Cada PDF va en su propio bloque del prompt y las páginas se numeran dentro
de su documento.

`config` = `{titulo?, num_preguntas: 5-200, dificultad: 1-5, tipos: [TipoPregunta], instrucciones: str ≤ 2000,
tiempos_por_tipo?: {tipo: segundos}, repaso: "fsrs"|"leitner", final_n?: 3-40 (10), final_g?: 60-100 (70)}`.
`final_n` y `final_g` configuran el nivel final de cada sección (ver «Nivel final»).

`TipoPregunta` ∈ `multiple_choice, true_false, fill_text, fill_code, numeric, ordering, open, math_problem, proof`

`Curso` = `{id, titulo, tema, estado, secciones: [{id, titulo, orden, niveles: [{id, titulo, orden,
es_calentamiento, es_final, preguntas: [Pregunta]}]}]}`. Cada sección termina con un nivel final
(`Nivel.es_final`) que el pipeline añade sin generarle preguntas (`preguntas: []`; las toma de la sección al jugar).

Migración (aún sin Alembic; `create_all` la crea en bases nuevas). En una base existente:

```sql
ALTER TABLE niveles ADD COLUMN es_final BOOLEAN NOT NULL DEFAULT false;
```

`Pregunta` = `{id, tipo, enunciado, opciones?: [str], respuesta: <según tipo>, tolerancia?: number,
explicacion, pista?: str, dificultad: 1-5, tiempo_s, fuente_pagina?: int, fuente_documento?: str, valida: bool,
problemas: [str]}`. `fuente_documento` = nombre (saneado) del PDF de donde sale y `fuente_pagina` = página dentro
de ese PDF; se omiten si no se conocen. `fuente_documento` también es editable por PATCH.

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
| POST | /juego/intentos/{id}/revisar | multipart: `pregunta_id`, `respuesta`, `imagen` | `{retroalimentacion}` (requiere API key BYOK; foto JPG/PNG/WebP ≤ 5 MB en `open`, `fill_code`, `numeric`, `math_problem` y `proof`) |
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

## Ampliaciones v0.1 (juego)
Acordadas con el frontend; amplían la sección "Juego" sin romperla.

1. `POST /juego/paleta {paleta_id}` → `Estado`. Elige la paleta preferida; 409 si no está desbloqueada.
2. `POST /juego/intentos/{id}/ayuda` → `{tipo_ayuda, datos}` con `datos` según la ayuda:
   MC/VF `{"eliminar_opcion": int}` (VF: índice 0 = Verdadero, 1 = Falso), `tipo_ayuda: "eliminar_opcion"`;
   completar `{"revelar": str}` (prefijo), `"revelar"`; numérica `{"intervalo": [min, max]}`, `"intervalo"`;
   ordenar `{"fijar_paso": {"posicion": int, "indice": int}}`, `"fijar_paso"`;
   pista (legendaria en abierta: IA con la key BYOK o, si no hay o falla, la pista escrita) `{"pista": str}`, `"pista"`.
3. Responder: en `open`/`math_problem`/`proof` el cliente manda `respuesta: true|false` (autoevaluación;
   también se acepta `{"autoevaluacion": bool}`). `respuesta: null` = timeout (incorrecta, cuenta como timeout)
   en cualquier tipo. El servidor también marca timeout si pasó `tiempo_s + 2 s` (reloj del servidor, desde
   `iniciar` o la respuesta anterior) o si `tiempo_ms > tiempo_s`.
4. `PreguntaJugable` = `{id, tipo, enunciado, opciones: [str] | null, dificultad, tiempo_s, es_calentamiento,
   explicacion?}`; `explicacion` solo en abiertas/math/proof. Nunca incluye la respuesta correcta ni la pista.
5. Mascotas: aparecen en `inventario` como ítems `{item_id: "mascota_<especie>", cantidad: 1}`;
   `EstadoMascota.id` usa ese mismo id y `POST /juego/mascotas/equipar {mascota_id}` lo recibe.
6. Ids públicos de ítems: `botiquin`, `pocion_resurreccion`, `comida`, `escudo`, `pocion_tiempo`, `lupa` y
   `mascota_<especie>` (mapeo a ids internos en `app/play/ids.py`).
   `POST /juego/items/usar` acepta además `intento_id` (poción de tiempo: +10 s a la pregunta en curso) e
   `intento_id` + `pregunta_id` (lupa: muestra la pista escrita; 409 si no hay). Para esos dos, el `Estado`
   devuelto trae además `efecto`: `{"segundos_extra": int}` o `{"pista": str}`. `comida` da +5 de comida.
7. Camino: tras el nivel que lo ganó aparece un nodo `{id, titulo, estado: "disponible"|"completado", tipo: "cofre"}`;
   su `id` es el del cofre para `POST /juego/cofres/{id}/abrir`.
8. `terminar.xp_ganada` es la XP total del intento (aciertos + fin de nivel + racha); `terminar.monedas` y
   `abrir.monedas` son las monedas ganadas; `cofre` = `{id, tipo: "normal"|"legendario"}`. `comprar.monedas` es el saldo.

## Nivel final v0.2 (juego)
Examen-aventura al cierre de cada sección (spec `final-level`; decisiones Q15, Q35, Q37–Q40, Q106).

1. Camino: el último nodo de cada sección es `{id, titulo, estado, tipo: "final"}` (castillo). Se juega en la
   ruta del frontend `/final/:nivelId`. Al aprobarlo aparece detrás el nodo `cofre` legendario.
2. `POST /juego/niveles/{id}/iniciar` en un nivel final: las preguntas salen de las propias del nivel más las
   de los demás niveles de su sección (sin `open/math_problem/proof`, salvo que no haya otras), nunca vistas
   primero y ordenadas por dificultad creciente. `N = min(final_n, banco)`. La respuesta añade:
   `final = {n, n_configurado, g, requeridas, margen, encuentros, aciertos, fallos, restantes, corazones,
   resultado}` con `requeridas = ceil(N·g/100)`, `margen = N − requeridas`, `corazones = margen − fallos`,
   `resultado ∈ "en_curso"|"victoria"|"derrota"` y
   `encuentros = [{tipo: "comun"|"raro"|"jefe", desde, cuantas, fase2_desde?}]` (índices sobre `preguntas`;
   común 1 pregunta, raro 2, jefe ~35 % y mínimo 2 si N ≥ 4).
   **Gimmick del jefe (Q40)**: desde `fase2_desde` el jefe entra en furia y esas preguntas ya traen
   `tiempo_s` reducido un 25 % (mínimo 8 s); el servidor mide con ese tiempo.
3. `responder` en un nivel final añade `final` (mismo objeto, actualizado). Sin vidas de mascota: un fallo no
   cambia `vidas` (Q106). Victoria temprana al llegar a `requeridas` (Q37): se puede seguir respondiendo
   (bonus) o terminar. Derrota en cuanto `fallos > margen`: desde ahí `responder` → 409.
4. `ayuda` → 409 y `items/usar` con `intento_id` de un nivel final → 409 (Q38, Q106).
5. `terminar` en un nivel final añade `final: {..., aprobado: bool}`. Aprobado: XP de nivel + jefe (+100),
   cofre legendario (Q15; solo la primera vez, repetir da monedas) y cuenta como nivel completado (desbloquea
   la siguiente sección). Reprobado: `monedas: 0`, sin cofre ni progreso; solo queda la XP de los aciertos.
   Las preguntas sin responder no cuentan como timeout. Abandonar = no llamar `terminar` (o iniciar otro
   nivel): la partida se descarta y las preguntas quedan como vistas.

## Ampliaciones v0.3 (juego)
Todas son campos o rutas nuevas; nada de lo anterior cambia de forma (salvo que un nivel no aprobado ya no
se completa, punto 5).

1. **Estado** añade `minimo_aprobar` (int 0–100, por defecto 60), `equipo: {arma, armadura, ropa}` (item_id
   público o `null`) y `evoluciones_mascotas: {item_id público: {xp, etapa: 1|2|3, xp_siguiente: int|null}}`
   (todas las mascotas poseídas). `EstadoMascota` añade `xp`, `etapa`, `xp_siguiente` y `racha_sin_ayuda`
   (de la mascota equipada); `ayudas_restantes_nivel` ya cuenta la ayuda extra de la etapa 3.
2. **Equipables** (`arma_*`, `armadura_*`, `ropa_*`; id interno = público). Se poseen una vez: aparecen en
   `inventario` con `cantidad: 1`; salen en cofres/drops y en la tienda.
   - `GET /juego/tienda`: cada artículo añade `clase` ∈ `consumible|mascota|arma|armadura|ropa`.
   - `POST /juego/tienda/comprar` de un equipable o mascota ya poseído → 409.
   - `POST /juego/items/usar` con un equipable → 409.
   - `POST /juego/equipo {item_id}` → `Estado`; 409 si no existe, no es equipable o no lo posee.
   - `POST /juego/equipo/quitar {ranura: "arma"|"armadura"|"ropa"}` → `Estado` (422 si la ranura no es válida).
3. `POST /juego/ajustes {minimo_aprobar: 0..100}` → `Estado` (422 fuera de rango).
4. **Pausa** (mejora 2). `POST /juego/intentos/{id}/pausar` → 204 (idempotente; 409 si la partida ya terminó).
   Congela el reloj de la pregunta en curso. `POST /juego/niveles/{id}/iniciar` con un intento `en_curso` de
   ESE nivel (pausado o no) lo retoma en vez de crear otro:
   `{intento_id, preguntas (todas, mismo orden), reanudado: true, progreso: {respondidas: [{pregunta_id,
   correcta, xp_ganada}], restante_s, xp_ganada}}` (+ `final` en un nivel final, + `reintento` si lo era).
   Al retomar, el reloj se descongela con el tiempo que quedaba (`restante_s` es de la primera pregunta sin
   responder; 0 si ya no queda ninguna: llama a `terminar`). Si la partida no se pausó, el tiempo siguió
   corriendo. `responder`/`ayuda` sobre una partida pausada la reanudan implícitamente (el tiempo pausado no
   cuenta). El cupo de ayudas no se reinicia al retomar. Iniciar OTRO nivel abandona el intento en curso.
5. **Mínimo para aprobar** (mejora 6). `terminar` en lecciones y calentamientos añade `aprobado`,
   `porcentaje` (aciertos·100 // preguntas, entero hacia abajo) y `minimo`. `aprobado = porcentaje ≥
   minimo_aprobar`. No aprobado: no se completa el nivel (sigue `actual` en el camino), no avanza el contador
   de cofres, sin cofre ni ítem, monedas de nivel repetido (5–10), sin +1 vida, XP solo la de las respuestas.
   El nivel final mantiene su propia regla (`g`).
   **Reintento**: si el último intento terminado de un nivel no completado no se aprobó, `iniciar` añade
   `reintento: true` y elige preguntas distintas de la misma dificultad: propias no servidas → de otros
   niveles (no finales) de la sección con la dificultad de las servidas, nunca vistas primero → las ya
   servidas como último recurso. Esas preguntas pueden venir de otros niveles (como el repaso).
6. **Cofres y drops sin repetidos** (mejora 7): no dan mascotas ni equipables ya poseídos ni repiten ítem
   dentro de un cofre; si no queda candidato, ese hueco se paga en monedas (ya sumadas en `monedas`), así que
   `items` puede traer menos de 2.
7. **Evolución de mascota** (mejora 10). `responder` añade `mascota_evento: {xp_ganada, evoluciono, etapa}`
   (`null` en el nivel final o sin mascota viva). Acierto sin pedir ayuda en esa pregunta: racha + 1 y
   `2 + min(3, racha // 3)` XP; con ayuda, fallo o timeout: racha 0 y 0 XP. Etapas: 1 desde 0 XP, 2 desde 60,
   3 desde 200 (la 3 da +1 ayuda por nivel). Extensión: `terminar` (lecciones) añade `mascota_evento` con el
   bonus de nivel (+10 aprobado sin ayudas ni vidas perdidas, +4 si cumple solo una) o `null` si no hubo bonus.
   La XP es de la mascota equipada en ese momento. El nivel final no da XP de mascota.
8. **Nivel final en cursos viejos** (mejora 8): al arrancar (`python -m app.core.crear_tablas`) y al validar/
   publicar un curso (`pipeline.servicio.validar_curso`) se añade, de forma idempotente, un nivel
   `es_final` («Nivel final: <sección>», sin preguntas propias) al final de cada sección que no lo tenga.

Persistencia v0.3 (sin Alembic; `create_all` crea la columna en bases nuevas). `crear_tablas` ejecuta en
PostgreSQL, de forma idempotente:

```sql
ALTER TABLE juego_estado ADD COLUMN IF NOT EXISTS extras JSON;
```

`extras` = `{minimo_aprobar, equipo: {arma, armadura, ropa}, evoluciones: {mascota_id interno: {xp,
racha_sin_ayuda}}}` (NULL en filas viejas = valores por defecto). La pausa, `aprobado`, `reintento`,
`xp_ganada`, `ayuda_pedida` y `vida_perdida` se guardan dentro del JSON `juego_intentos.preguntas`.
