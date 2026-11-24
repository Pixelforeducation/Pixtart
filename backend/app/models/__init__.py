from app.models.base import Base  # noqa: F401

# Cada agente añade aquí UNA línea importando su módulo de modelos:
from app.models import usuarios  # noqa: F401   (plataforma)
from app.models import cursos  # noqa: F401   (pipeline)
# from app.models import juego     # noqa: F401   (juego-api)
