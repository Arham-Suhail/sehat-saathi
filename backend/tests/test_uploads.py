import pytest

from app.uploads import normalize_image, sniff_image_type
from tests.conftest import auth, jpeg_bytes, png_bytes, register


@pytest.fixture
async def elder(client):
    return await register(client, "elder")


async def _post(client, token, data, ctype):
    return await client.post(
        "/prescriptions/extract", content=data, headers={**auth(token), "Content-Type": ctype}
    )


async def test_valid_png_extracts_with_pharmacist_flag(client, elder):
    r = await _post(client, elder["token"], png_bytes(), "image/png")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_prescription"] is True
    assert len(body["medicines"]) == 2
    clear, unclear = body["medicines"]
    assert clear["needs_pharmacist"] is False
    assert clear["suggested_times"] == ["08:00", "20:00"]
    assert clear["frequency"]["label"] == "Subah aur raat"
    assert clear["reminder_mode"] == "fixed"
    assert unclear["needs_pharmacist"] is True
    assert body["needs_pharmacist"] is True
    assert "doctor" in body["disclaimer"].lower()


async def test_valid_jpeg_accepted(client, elder):
    r = await _post(client, elder["token"], jpeg_bytes(), "image/jpeg")
    assert r.status_code == 200


async def test_non_image_rejected(client, elder):
    r = await _post(client, elder["token"], b"hello, I am text", "text/plain")
    assert r.status_code == 415


async def test_pdf_disguised_as_jpeg_rejected(client, elder):
    r = await _post(client, elder["token"], b"%PDF-1.7\n" + b"0" * 200, "image/jpeg")
    assert r.status_code == 415


async def test_mismatched_magic_and_type_rejected(client, elder):
    r = await _post(client, elder["token"], png_bytes(), "image/jpeg")
    assert r.status_code == 415


async def test_truncated_image_rejected(client, elder):
    data = png_bytes()[:40]
    r = await _post(client, elder["token"], data, "image/png")
    assert r.status_code == 415


async def test_oversized_rejected(client, elder):
    big = b"\x89PNG\r\n\x1a\n" + b"0" * (5 * 1024 * 1024 + 10)
    r = await _post(client, elder["token"], big, "image/png")
    assert r.status_code == 413


async def test_empty_body_rejected(client, elder):
    r = await _post(client, elder["token"], b"", "image/png")
    assert r.status_code in (400, 415)


async def test_requires_auth_and_elder_role(client):
    r = await _post(client, "nope", png_bytes(), "image/png")
    assert r.status_code == 401
    fam = await register(client, "family")
    r = await _post(client, fam["token"], png_bytes(), "image/png")
    assert r.status_code == 403


def test_sniff_and_normalize_strip_metadata():
    assert sniff_image_type(png_bytes()) == "image/png"
    assert sniff_image_type(jpeg_bytes()) == "image/jpeg"
    assert sniff_image_type(b"GIF89a....") is None
    out = normalize_image(png_bytes((3000, 2000)))
    assert sniff_image_type(out) == "image/jpeg"
    from io import BytesIO

    from PIL import Image

    with Image.open(BytesIO(out)) as img:
        assert max(img.size) <= 1600
        assert not img.info.get("exif")
