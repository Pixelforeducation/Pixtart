"""Registro de routers. Cada agente añade UNA línea con su router."""

from fastapi import FastAPI


def incluir_routers(app: FastAPI) -> None:
    from app.auth.router import router as auth_router; app.include_router(auth_router)  # noqa: E702
    from app.keys.router import router as keys_router; app.include_router(keys_router)  # noqa: E702
    # from app.pipeline.router import router as cursos_router; app.include_router(cursos_router)
    # from app.play.router import router as juego_router; app.include_router(juego_router)
    pass
