def test_salud(client):
    r = client.get("/api/salud")
    assert r.status_code == 200
    assert r.json() == {"estado": "ok"}


def test_422_en_formato_del_contrato(client):
    r = client.post("/api/auth/login", json={"correo": 5})
    assert r.status_code == 422
    assert isinstance(r.json()["detail"], str)
