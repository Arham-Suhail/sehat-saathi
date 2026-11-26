from tests.conftest import register


async def test_health_and_security_headers(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "db": "ok"}
    h = r.headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert h["referrer-policy"] == "no-referrer"
    assert "frame-ancestors 'none'" in h["content-security-policy"]
    assert "permissions-policy" in h
    assert h["cache-control"] == "no-store"
    assert h["x-request-id"]


async def test_cors_allowlist(client):
    ok = await client.options(
        "/auth/login",
        headers={"Origin": "https://app.example", "Access-Control-Request-Method": "POST"},
    )
    assert ok.headers.get("access-control-allow-origin") == "https://app.example"
    bad = await client.options(
        "/auth/login",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert bad.headers.get("access-control-allow-origin") is None
    assert "access-control-allow-credentials" not in bad.headers


async def test_body_limit_by_content_length(client):
    r = await client.post(
        "/auth/login", content=b"x" * (7 * 1024 * 1024), headers={"Content-Type": "application/json"}
    )
    assert r.status_code == 413


async def test_unhandled_error_hides_internals(app, client):
    @app.get("/boom")
    async def boom():
        raise RuntimeError("secret internal detail /etc/passwd")

    r = await client.get("/boom")
    assert r.status_code == 500
    assert "secret internal" not in r.text
    assert "Traceback" not in r.text
    assert r.json()["detail"] == "Kuch ghalat ho gaya"


async def test_404_and_405_are_clean(client):
    r = await client.get("/does-not-exist")
    assert r.status_code == 404
    r = await client.get("/auth/login")
    assert r.status_code == 405


async def test_rate_limit_login(client):
    reg = await register(client, "elder")
    codes = []
    for _ in range(7):
        r = await client.post("/auth/login", json={"email": reg["email"], "password": "wrong-pass"})
        codes.append(r.status_code)
    assert codes[:5] == [401] * 5
    assert codes[5] == 429
    assert "Retry-After" in r.headers


async def test_rate_limit_register(client):
    codes = []
    for i in range(4):
        r = await client.post(
            "/auth/register",
            json={"name": "A", "email": f"rl{i}@example.com", "password": "pass-1234", "role": "elder"},
        )
        codes.append(r.status_code)
    assert codes == [201, 201, 201, 429]


async def test_health_answers_head_for_uptime_monitors(client):
    # UptimeRobot (and most uptime monitors) default to HEAD; a 405 shows the API as "down".
    r = await client.head("/health")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "no-store"
