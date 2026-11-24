def test_salud(client):
    r = client.get("/api/salud")
    assert r.status_code == 200
    assert r.json() == {"estado": "ok"}
