"""Servicio de API keys (BYOK) y control de uso de tokens.

Interfaz para otros agentes (contrato):
- `obtener_key_descifrada(db, usuario_id) -> str | None`
- `registrar_uso(db, usuario_id, tokens_entrada, tokens_salida) -> None` (lanza `LimiteExcedido`)
- `verificar_limite(db, usuario_id)` para comprobar antes de llamar al LLM (lanza `LimiteExcedido`).

Nunca se escribe la key en logs ni se devuelve en respuestas: solo `ultimos4`.
"""

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.keys.cifrado import cifrar, descifrar
from app.keys.validador import MODELO_POR_DEFECTO, KeyInvalida, ValidadorKey
from app.models.usuarios import ApiKey, LimitesUso, Usuario, UsoTokens

TOPE_DIARIO_POR_DEFECTO = 200_000
TOPE_MENSUAL_POR_DEFECTO = 3_000_000


class LimiteExcedido(Exception):
    """Se superó el tope diario o mensual de tokens. `mensaje` es apto para el usuario."""

    def __init__(self, mensaje: str, periodo: str):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.periodo = periodo  # "diario" | "mensual"


# ---------- keys ----------


def guardar_key(
    db: Session,
    usuario_id: str,
    proveedor: str,
    api_key: str,
    modelo: str | None,
    validador: ValidadorKey,
) -> ApiKey:
    """Valida la key (lanza `KeyInvalida`) y la guarda cifrada, reemplazando la anterior."""
    api_key = api_key.strip()
    if not 8 <= len(api_key) <= 512:
        raise KeyInvalida("La key no tiene un formato válido.")
    modelo = modelo or MODELO_POR_DEFECTO[proveedor]
    validador.validar(proveedor, api_key, modelo)
    ciphertext, dek_cifrada = cifrar(usuario_id, api_key)
    # Una sola key activa por usuario: la nueva reemplaza (y borra) la anterior.
    db.execute(delete(ApiKey).where(ApiKey.usuario_id == usuario_id))
    nueva = ApiKey(
        usuario_id=usuario_id,
        proveedor=proveedor,
        modelo=modelo,
        ciphertext=ciphertext,
        dek_cifrada=dek_cifrada,
        ultimos4=api_key[-4:],
        estado="activa",
    )
    db.add(nueva)
    db.commit()
    return nueva


def listar_keys(db: Session, usuario_id: str) -> list[ApiKey]:
    return list(
        db.scalars(
            select(ApiKey).where(ApiKey.usuario_id == usuario_id).order_by(ApiKey.created_at)
        )
    )


def borrar_key(db: Session, usuario_id: str, key_id: str) -> bool:
    """Borra la fila completa (texto cifrado y DEK). Devuelve False si no es del usuario."""
    r = db.execute(delete(ApiKey).where(ApiKey.id == key_id, ApiKey.usuario_id == usuario_id))
    db.commit()
    return r.rowcount > 0


def _key_activa(db: Session, usuario_id: str) -> ApiKey | None:
    return db.scalar(
        select(ApiKey)
        .where(ApiKey.usuario_id == usuario_id, ApiKey.estado == "activa")
        .order_by(ApiKey.created_at.desc())
    )


def obtener_key_descifrada(db: Session, usuario_id: str) -> str | None:
    """La key activa en claro, solo para usarla en memoria. None si no hay key activa."""
    k = _key_activa(db, usuario_id)
    if k is None:
        return None
    return descifrar(usuario_id, k.ciphertext, k.dek_cifrada)


def obtener_modelo(db: Session, usuario_id: str) -> str | None:
    """Modelo elegido para la key activa (None si no hay key activa)."""
    k = _key_activa(db, usuario_id)
    return k.modelo if k else None


def marcar_key_invalida(db: Session, usuario_id: str) -> None:
    """Para quien reciba un 401/403 del proveedor al usar la key."""
    k = _key_activa(db, usuario_id)
    if k is not None:
        k.estado = "invalida"
        db.commit()


# ---------- límites y uso ----------


def _zona(db: Session, usuario_id: str) -> ZoneInfo:
    u = db.get(Usuario, usuario_id)
    try:
        return ZoneInfo(u.zona_horaria if u else "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _fecha_local(db: Session, usuario_id: str, ahora: datetime | None) -> date:
    ahora = ahora or datetime.now(UTC)
    if ahora.tzinfo is None:
        ahora = ahora.replace(tzinfo=UTC)
    return ahora.astimezone(_zona(db, usuario_id)).date()


def obtener_limites(db: Session, usuario_id: str) -> LimitesUso:
    lim = db.get(LimitesUso, usuario_id)
    if lim is None:
        lim = LimitesUso(
            usuario_id=usuario_id,
            tope_diario_tokens=TOPE_DIARIO_POR_DEFECTO,
            tope_mensual_tokens=TOPE_MENSUAL_POR_DEFECTO,
        )
    return lim


def actualizar_limites(db: Session, usuario_id: str, diario: int, mensual: int) -> LimitesUso:
    lim = db.get(LimitesUso, usuario_id)
    if lim is None:
        lim = LimitesUso(usuario_id=usuario_id)
        db.add(lim)
    lim.tope_diario_tokens = diario
    lim.tope_mensual_tokens = mensual
    db.commit()
    return lim


def usados(db: Session, usuario_id: str, ahora: datetime | None = None) -> tuple[int, int]:
    """`(usados_hoy, usados_mes)` en tokens de entrada + salida, según la fecha local."""
    hoy = _fecha_local(db, usuario_id, ahora)
    total = func.coalesce(func.sum(UsoTokens.tokens_entrada + UsoTokens.tokens_salida), 0)
    base = select(total).where(UsoTokens.usuario_id == usuario_id)
    usados_hoy = db.scalar(base.where(UsoTokens.fecha == hoy))
    usados_mes = db.scalar(
        base.where(UsoTokens.fecha >= hoy.replace(day=1), UsoTokens.fecha <= hoy)
    )
    return int(usados_hoy), int(usados_mes)


def _comprobar(lim: LimitesUso, usados_hoy: int, usados_mes: int, estricto: bool) -> None:
    def pasa(usado: int, tope: int) -> bool:
        return usado > tope if estricto else usado >= tope

    if pasa(usados_hoy, lim.tope_diario_tokens):
        raise LimiteExcedido(
            "Llegaste a tu tope diario de tokens. Puedes subirlo en Ajustes o esperar a mañana.",
            "diario",
        )
    if pasa(usados_mes, lim.tope_mensual_tokens):
        raise LimiteExcedido(
            "Llegaste a tu tope mensual de tokens. Puedes subirlo en Ajustes.", "mensual"
        )


def verificar_limite(db: Session, usuario_id: str, *, ahora: datetime | None = None) -> None:
    """Lanza `LimiteExcedido` si ya se alcanzó el tope (úsala antes de llamar al LLM)."""
    _comprobar(obtener_limites(db, usuario_id), *usados(db, usuario_id, ahora), estricto=False)


def registrar_uso(
    db: Session,
    usuario_id: str,
    tokens_entrada: int,
    tokens_salida: int,
    *,
    ahora: datetime | None = None,
) -> None:
    """Suma el consumo del día (siempre se registra: los tokens ya se gastaron) y lanza
    `LimiteExcedido` si con esto se pasa del tope diario o mensual."""
    if tokens_entrada < 0 or tokens_salida < 0:
        raise ValueError("Los tokens no pueden ser negativos.")
    fecha = _fecha_local(db, usuario_id, ahora)
    fila = db.scalar(
        select(UsoTokens).where(UsoTokens.usuario_id == usuario_id, UsoTokens.fecha == fecha)
    )
    if fila is None:
        fila = UsoTokens(usuario_id=usuario_id, fecha=fecha, tokens_entrada=0, tokens_salida=0)
        db.add(fila)
    fila.tokens_entrada += tokens_entrada
    fila.tokens_salida += tokens_salida
    db.commit()
    _comprobar(obtener_limites(db, usuario_id), *usados(db, usuario_id, ahora), estricto=True)
