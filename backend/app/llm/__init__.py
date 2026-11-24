"""Clientes de LLM tras una interfaz común (ver base.ClienteLLM)."""

from app.llm.base import ClienteLLM, ErrorLLM, SalidaInvalida, Uso

__all__ = ["ClienteLLM", "ErrorLLM", "SalidaInvalida", "Uso"]
