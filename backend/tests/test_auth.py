from datetime import UTC, date, datetime, timedelta

import pytest

from app.auth.deps import hoy
from app.auth.seguridad import crear_token
from app.main import app

HOY = date(2026, 11, 24)


@pytest.fixture(autouse=True)
def hoy_fijo():
    app.dependency_overrides[hoy] = lambda: HOY
    yield


def _registro(client, **cambios):
    datos = {
        "correo": "Ana@Ejemplo.com",
        "contrasena": "una-contrasena-larga",
        "fecha_nacimiento": "1990-05-01",
        "zona_horaria": "America/Mexico_City",
    }
    datos.update(cambios)
    return client.post("/api/auth/registro", json=datos)


def test_registro_ok_normaliza_correo(client, db):
    r = _registro(client)
    assert r.status_code == 201
    assert r.json()["correo"] == "ana@ejemplo.com"
    from app.models.usuarios import Usuario

    u = db.get(Usuario, r.json()["id"])
    assert u.hash_contrasena.startswith("$argon2")
    assert "una-contrasena-larga" not in u.hash_contrasena


def test_menor_de_18_rechazado(client):
    # Cumple 18 mañana.
    r = _registro(client, fecha_nacimiento="2008-11-25")
    assert r.status_code == 422
    assert "18 años" in r.json()["detail"]


def test_cumple_18_hoy_aceptado(client):
    assert _registro(client, fecha_nacimiento="2008-11-24").status_code == 201


def test_contrasena_corta(client):
    r = _registro(client, contrasena="corta")
    assert r.status_code == 422
    assert "10 caracteres" in r.json()["detail"]


def test_zona_horaria_invalida(client):
    r = _registro(client, zona_horaria="Marte/Olympus")
    assert r.status_code == 422
    assert "zona horaria" in r.json()["detail"]


def test_correo_duplicado(client):
    assert _registro(client).status_code == 201
    r = _registro(client, correo="ana@ejemplo.com ")
    assert r.status_code == 409
    assert "Ya existe" in r.json()["detail"]


def test_login_ok_y_yo(client):
    _registro(client)
    r = client.post(
        "/api/auth/login", json={"correo": "ANA@ejemplo.com", "contrasena": "una-contrasena-larga"}
    )
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["usuario"]["correo"] == "ana@ejemplo.com"
    yo = client.get("/api/auth/yo", headers={"Authorization": f"Bearer {cuerpo['token']}"})
    assert yo.status_code == 200
    assert yo.json() == {
        "id": cuerpo["usuario"]["id"],
        "correo": "ana@ejemplo.com",
        "zona_horaria": "America/Mexico_City",
    }


@pytest.mark.parametrize(
    "correo,contrasena",
    [("ana@ejemplo.com", "otra-contrasena-mala"), ("nadie@ejemplo.com", "una-contrasena-larga")],
)
def test_login_mal_mensaje_generico(client, correo, contrasena):
    _registro(client)
    r = client.post("/api/auth/login", json={"correo": correo, "contrasena": contrasena})
    assert r.status_code == 401
    assert r.json()["detail"] == "Correo o contraseña incorrectos."


def test_yo_sin_token(client):
    assert client.get("/api/auth/yo").status_code == 401


def test_yo_token_invalido_o_caducado(client):
    uid = _registro(client).json()["id"]
    assert client.get("/api/auth/yo", headers={"Authorization": "Bearer basura"}).status_code == 401
    viejo = crear_token(uid, ahora=datetime.now(UTC) - timedelta(days=8))
    r = client.get("/api/auth/yo", headers={"Authorization": f"Bearer {viejo}"})
    assert r.status_code == 401
