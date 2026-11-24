"""Punto de entrada de la API de Pixtart."""

from fastapi import FastAPI

from app.api.routers import incluir_routers

app = FastAPI(title="Pixtart API", version="0.1.0")


@app.get("/api/salud")
def salud() -> dict[str, str]:
    return {"estado": "ok"}


incluir_routers(app)
