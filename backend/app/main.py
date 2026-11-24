"""Punto de entrada de la API de Pixtart."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.routers import incluir_routers

app = FastAPI(title="Pixtart API", version="0.1.0")


@app.get("/api/salud")
def salud() -> dict[str, str]:
    return {"estado": "ok"}




@app.exception_handler(RequestValidationError)
async def _validacion(_: Request, exc: RequestValidationError) -> JSONResponse:
    """Convierte los 422 de pydantic al formato del contrato, sin repetir valores enviados."""
    campos = []
    for e in exc.errors():
        loc = [str(x) for x in e.get("loc", ()) if x not in ("body", "query", "path")]
        campos.append(".".join(loc) or "petición")
    detalle = "Revisa estos campos: " + ", ".join(dict.fromkeys(campos)) + "."
    return JSONResponse(status_code=422, content={"detail": detalle, "campos": campos})


incluir_routers(app)
