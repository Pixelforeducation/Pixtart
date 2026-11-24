from datetime import UTC, datetime

import pytest

from app.auth.deps import hoy
from app.keys import service
from app.keys.validador import KeyInvalida, obtener_validador
from app.main import app
from app.models.usuarios import ApiKey

KEY = "sk-ant-api03-secreto-de-prueba-WXYZ"


class ValidadorFalso:
    def __init__(self):
        self.llamadas = []

    def validar(self, proveedor, api_key, modelo):
        self.llamadas.append((proveedor, modelo))
        if "mala" in api_key:
            raise KeyInvalida("Anthropic rechazó la key.")


@pytest.fixture
def validador():
    v = ValidadorFalso()
    app.dependency_overrides[obtener_validador] = lambda: v
    app.dependency_overrides[hoy] = lambda: datetime.now(UTC).date()
    return v


def _usuario(client, correo="ana@ejemplo.com"):
    r = client.post(
        "/api/auth/registro",
        json={
            "correo": correo,
            "contrasena": "una-contrasena-larga",
            "fecha_nacimiento": "1990-01-01",
            "zona_horaria": "UTC",
        },
    )
    uid = r.json()["id"]
    tok = client.post(
        "/api/auth/login", json={"correo": correo, "contrasena": "una-contrasena-larga"}
    ).json()["token"]
    return uid, {"Authorization": f"Bearer {tok}"}


def test_guardar_key_solo_ultimos4_y_cifrada(client, db, validador):
    uid, h = _usuario(client)
    r = client.post("/api/keys", json={"proveedor": "anthropic", "api_key": KEY}, headers=h)
    assert r.status_code == 201
    cuerpo = r.json()
    assert cuerpo["ultimos4"] == "WXYZ"
    assert cuerpo["modelo"] == "claude-haiku-5-5"
    assert cuerpo["estado"] == "activa"
    assert KEY not in r.text
    assert validador.llamadas == [("anthropic", "claude-haiku-5-5")]

    lista = client.get("/api/keys", headers=h)
    assert KEY not in lista.text
    assert [k["id"] for k in lista.json()] == [cuerpo["id"]]

    fila = db.get(ApiKey, cuerpo["id"])
    assert KEY.encode() not in fila.ciphertext
    assert KEY.encode() not in fila.dek_cifrada
    assert service.obtener_key_descifrada(db, uid) == KEY


def test_key_invalida_400(client, db, validador):
    _, h = _usuario(client)
    r = client.post(
        "/api/keys", json={"proveedor": "anthropic", "api_key": "sk-ant-mala-1234"}, headers=h
    )
    assert r.status_code == 400
    assert "rechazó" in r.json()["detail"]
    assert db.query(ApiKey).count() == 0


def test_proveedor_no_soportado_422_sin_eco_de_key(client, validador):
    _, h = _usuario(client)
    r = client.post("/api/keys", json={"proveedor": "otro", "api_key": KEY}, headers=h)
    assert r.status_code == 422
    assert KEY not in r.text


def test_nueva_key_reemplaza_anterior(client, db, validador):
    uid, h = _usuario(client)
    client.post("/api/keys", json={"proveedor": "anthropic", "api_key": KEY}, headers=h)
    otra = "sk-ant-api03-segunda-key-ABCD"
    client.post(
        "/api/keys",
        json={"proveedor": "anthropic", "api_key": otra, "modelo": "claude-sonnet-5"},
        headers=h,
    )
    lista = client.get("/api/keys", headers=h).json()
    assert len(lista) == 1
    assert lista[0]["ultimos4"] == "ABCD" and lista[0]["modelo"] == "claude-sonnet-5"
    assert service.obtener_key_descifrada(db, uid) == otra


def test_borrar_key(client, db, validador):
    uid, h = _usuario(client)
    kid = client.post(
        "/api/keys", json={"proveedor": "anthropic", "api_key": KEY}, headers=h
    ).json()["id"]
    assert client.delete(f"/api/keys/{kid}", headers=h).status_code == 204
    assert db.get(ApiKey, kid) is None
    assert service.obtener_key_descifrada(db, uid) is None
    assert client.get("/api/keys", headers=h).json() == []
    assert client.delete(f"/api/keys/{kid}", headers=h).status_code == 404


def test_otro_usuario_no_ve_ni_borra_tus_keys(client, db, validador):
    uid_a, ha = _usuario(client, "ana@ejemplo.com")
    _, hb = _usuario(client, "beto@ejemplo.com")
    kid = client.post(
        "/api/keys", json={"proveedor": "anthropic", "api_key": KEY}, headers=ha
    ).json()["id"]
    assert client.get("/api/keys", headers=hb).json() == []
    assert client.delete(f"/api/keys/{kid}", headers=hb).status_code == 404
    assert service.obtener_key_descifrada(db, uid_a) == KEY


def test_cifrado_ligado_al_usuario(client, db, validador):
    uid_a, ha = _usuario(client, "ana@ejemplo.com")
    uid_b, _ = _usuario(client, "beto@ejemplo.com")
    client.post("/api/keys", json={"proveedor": "anthropic", "api_key": KEY}, headers=ha)
    fila = db.query(ApiKey).one()
    from app.keys.cifrado import ErrorCifrado, descifrar

    with pytest.raises(ErrorCifrado):
        descifrar(uid_b, fila.ciphertext, fila.dek_cifrada)


def test_keys_sin_token(client):
    assert client.get("/api/keys").status_code == 401
    assert client.get("/api/keys/limites").status_code == 401


def test_limites_get_put(client, db, validador):
    uid, h = _usuario(client)
    r = client.get("/api/keys/limites", headers=h)
    assert r.json() == {
        "tope_diario_tokens": service.TOPE_DIARIO_POR_DEFECTO,
        "tope_mensual_tokens": service.TOPE_MENSUAL_POR_DEFECTO,
        "usados_hoy": 0,
        "usados_mes": 0,
    }
    r = client.put(
        "/api/keys/limites",
        json={"tope_diario_tokens": 1000, "tope_mensual_tokens": 5000},
        headers=h,
    )
    assert r.status_code == 200
    service.registrar_uso(db, uid, 100, 50)
    r = client.get("/api/keys/limites", headers=h).json()
    assert r == {
        "tope_diario_tokens": 1000,
        "tope_mensual_tokens": 5000,
        "usados_hoy": 150,
        "usados_mes": 150,
    }
    assert client.put(
        "/api/keys/limites", json={"tope_diario_tokens": -1, "tope_mensual_tokens": 5},
        headers=h,
    ).status_code == 422


def test_limite_excedido_diario_y_mensual(client, db, validador):
    uid, _ = _usuario(client)
    service.actualizar_limites(db, uid, diario=1000, mensual=1500)
    d1 = datetime(2026, 11, 3, 12, tzinfo=UTC)
    service.registrar_uso(db, uid, 600, 400, ahora=d1)  # exactamente el tope: no lanza
    with pytest.raises(service.LimiteExcedido) as e:
        service.verificar_limite(db, uid, ahora=d1)
    assert e.value.periodo == "diario"
    with pytest.raises(service.LimiteExcedido) as e:
        service.registrar_uso(db, uid, 1, 0, ahora=d1)
    assert e.value.periodo == "diario"
    # Otro día del mismo mes: el diario se reinicia pero el mensual se acumula.
    d2 = datetime(2026, 11, 4, 12, tzinfo=UTC)
    service.verificar_limite(db, uid, ahora=d2)
    with pytest.raises(service.LimiteExcedido) as e:
        service.registrar_uso(db, uid, 300, 300, ahora=d2)
    assert e.value.periodo == "mensual"
    assert service.usados(db, uid, d2) == (600, 1601)
    # Mes nuevo: todo en cero.
    service.verificar_limite(db, uid, ahora=datetime(2026, 12, 1, 12, tzinfo=UTC))
