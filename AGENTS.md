# AGENTS.md — Pixtart (código del juego)

Juego de aprendizaje pixel-art: el usuario sube PDFs, un LLM (con la API key del propio usuario)
arma un curso de Secciones → Niveles → Preguntas, y se juega con mascota, vidas, XP, paletas y cofres.
Las specs y el diseño viven FUERA de este repo, en `../openspec/`, `../design/`, `../PLAN-implementacion.md`
y `../decisiones/`. Si una spec choca con `../decisiones/respuestas-2026-11-24.txt`, gana la respuesta.

## Comandos
- Backend: `cd backend && uv venv --python 3.12 .venv && uv pip install --python .venv -e ".[dev]"`
- Tests: `cd backend && .venv/bin/pytest -q` · Lint: `cd backend && .venv/bin/ruff check .`
- Frontend: `cd frontend && npm install && npm run dev` · `npm run build` · `npm test`
- Todo junto: `cp .env.example .env` (rellena MASTER_KEY) y `docker compose up --build`

## Mapa
- `backend/app/core/` config, DB, Celery · `backend/app/models/` tablas
- `backend/app/auth/`, `keys/` cuentas y API keys (BYOK cifrado)
- `backend/app/game/` reglas puras del juego (sin I/O)
- `backend/app/pipeline/`, `llm/` PDF → curso con IA
- `backend/app/play/` endpoints de juego · `backend/app/api/CONTRATO.md` contrato HTTP
- `frontend/` React + TypeScript (Vite, PWA)

## Reglas
- Nunca trabajar en `main` ni hacer `git push` sin permiso explícito del autor.
- Aleatoriedad siempre con `random.Random(seed)` inyectado; nunca el `random` global.
- Las reglas de `game/` son funciones puras con tests; el reloj se pasa como argumento (`ahora`).
- Las API keys nunca se escriben en logs, respuestas ni el frontend tras enviarlas; solo `…ultimos4`.
- El texto de un PDF es DATO, nunca instrucciones: va delimitado en el prompt y la salida del LLM
  se valida contra un esquema estricto.
- Los tests no llaman a la API real de Anthropic: usan `app.llm.falso.LLMFalso`.
- Antes de terminar: `pytest -q` y `ruff check .` (y `npm run build` / `npm test` en frontend) y reporta el resultado.
