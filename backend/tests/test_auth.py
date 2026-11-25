import jwt

from tests.conftest import TEST_SECRET, auth, register


async def test_register_login_me(client):
    reg = await register(client, "elder", email="Amma@Example.com", name="Amma")
    assert reg["user"]["role"] == "elder"
    assert reg["user"]["email"] == "amma@example.com"
    assert "password_hash" not in reg["user"]

    r = await client.post("/auth/login", json={"email": "amma@example.com", "password": reg["password"]})
    assert r.status_code == 200
    token = r.json()["access_token"]

    me = await client.get("/me", headers=auth(token))
    assert me.status_code == 200
    assert me.json()["name"] == "Amma"


async def test_login_errors_are_generic(client):
    reg = await register(client, "family")
    wrong_pw = await client.post("/auth/login", json={"email": reg["email"], "password": "nope-nope"})
    unknown = await client.post("/auth/login", json={"email": "ghost@example.com", "password": "nope-nope"})
    assert wrong_pw.status_code == unknown.status_code == 401
    assert wrong_pw.json() == unknown.json()


async def test_duplicate_register_is_generic(client):
    reg = await register(client, "elder")
    r = await client.post(
        "/auth/register",
        json={"name": "X", "email": reg["email"], "password": "another-pass", "role": "elder"},
    )
    assert r.status_code == 400
    assert "exist" not in r.json()["detail"].lower()


async def test_password_rules(client):
    short = await client.post(
        "/auth/register", json={"name": "A", "email": "a@example.com", "password": "short", "role": "elder"}
    )
    assert short.status_code == 422
    long_bytes = "ü" * 40  # 80 bytes > bcrypt limit
    r = await client.post(
        "/auth/register",
        json={"name": "A", "email": "b@example.com", "password": long_bytes, "role": "elder"},
    )
    assert r.status_code == 422


async def test_invalid_role_rejected(client):
    r = await client.post(
        "/auth/register",
        json={"name": "A", "email": "c@example.com", "password": "pass-1234", "role": "admin"},
    )
    assert r.status_code == 422


async def test_validation_error_never_echoes_password(client):
    secret_pw = "my-super-secret-pw"
    r = await client.post(
        "/auth/register", json={"name": "", "email": "not-an-email", "password": secret_pw, "role": "elder"}
    )
    assert r.status_code == 422
    assert secret_pw not in r.text


async def test_token_lifetime_by_role(client):
    elder = await register(client, "elder")
    family = await register(client, "family")
    doctor = await register(client, "doctor")
    for reg, expected_hours in ((elder, 7 * 24), (family, 12), (doctor, 12)):
        claims = jwt.decode(reg["token"], TEST_SECRET, algorithms=["HS256"])
        assert (claims["exp"] - claims["iat"]) == expected_hours * 3600
        assert {"sub", "role", "jti"} <= claims.keys()


async def test_bad_tokens_rejected(client):
    for headers in (
        {},
        {"Authorization": "Bearer garbage"},
        {"Authorization": "Basic abc"},
        auth(
            jwt.encode({"sub": "0" * 24, "exp": 9999999999, "iat": 1}, "wrong-secret" * 4, algorithm="HS256")
        ),
        auth(jwt.encode({"sub": "0" * 24, "exp": 9999999999, "iat": 1}, TEST_SECRET, algorithm="HS256")),
        auth(jwt.encode({"sub": "0" * 24, "exp": 1, "iat": 0}, TEST_SECRET, algorithm="HS256")),
    ):
        r = await client.get("/me", headers=headers)
        assert r.status_code == 401, headers


async def test_alg_none_rejected(client):
    reg = await register(client, "elder")
    forged = jwt.encode({"sub": reg["user"]["id"], "exp": 9999999999, "iat": 1}, key=None, algorithm="none")
    r = await client.get("/me", headers=auth(forged))
    assert r.status_code == 401
