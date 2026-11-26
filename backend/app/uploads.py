"""Prescription image intake: memory only, never written to disk, never logged.

The client sends the image as the raw request body (Content-Type image/jpeg|png|webp),
so no multipart parser spools it to a temp file.
"""

import io

from fastapi import HTTPException, Request, status
from PIL import Image, UnidentifiedImageError

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_PIXELS = 40_000_000  # Pillow's own guard (it only *raises* above 2x this)
# Audit F6: our own hard limit, checked from the header BEFORE any decode. The web app
# shrinks photos to 1600 px before upload, so 20 MP is generous for any honest client
# and caps the worst-case decode at ~80 MB (RGBA) on the 512 MB instance.
MAX_DECODE_PIXELS = 20_000_000
MAX_SIDE = 1600

Image.MAX_IMAGE_PIXELS = MAX_PIXELS


def sniff_image_type(data: bytes) -> str | None:
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _reject(code: int, msg: str) -> HTTPException:
    return HTTPException(status_code=code, detail=msg)


async def read_image_body(request: Request, max_bytes: int) -> bytes:
    ctype = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    if ctype not in ALLOWED_TYPES:
        raise _reject(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Sirf JPG, PNG ya WebP tasveer bhejein")

    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > max_bytes:
        raise _reject(413, "Tasveer 5 MB se choti honi chahiye")

    buf = bytearray()
    async for chunk in request.stream():
        buf.extend(chunk)
        if len(buf) > max_bytes:
            raise _reject(413, "Tasveer 5 MB se choti honi chahiye")
    data = bytes(buf)
    if not data:
        raise _reject(status.HTTP_400_BAD_REQUEST, "Tasveer khaali hai")

    sniffed = sniff_image_type(data)
    if sniffed is None or sniffed != ctype:
        raise _reject(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Yeh sahi tasveer nahi hai")
    return data


def normalize_image(data: bytes) -> bytes:
    """Verify with Pillow, downscale, re-encode as JPEG (drops EXIF/metadata)."""
    try:
        with Image.open(io.BytesIO(data)) as probe:
            probe.verify()
        with Image.open(io.BytesIO(data)) as img:
            if img.format not in {"JPEG", "PNG", "WEBP"}:
                raise _reject(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Yeh sahi tasveer nahi hai")
            if img.width * img.height > MAX_DECODE_PIXELS:
                raise _reject(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Tasveer bohat bari hai")
            if img.format == "JPEG":
                img.draft("RGB", (MAX_SIDE, MAX_SIDE))  # decode at 1/2..1/8 scale when possible
            img.thumbnail((MAX_SIDE, MAX_SIDE))  # shrink before the RGB copy, not after
            img = img.convert("RGB")
            out = io.BytesIO()
            img.save(out, format="JPEG", quality=85, optimize=True)
            return out.getvalue()
    except HTTPException:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError, SyntaxError) as e:
        raise _reject(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Yeh sahi tasveer nahi hai") from e
