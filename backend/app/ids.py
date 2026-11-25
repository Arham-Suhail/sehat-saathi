import re

from bson import ObjectId
from fastapi import HTTPException, status

_HEX24 = re.compile(r"^[0-9a-fA-F]{24}$")


def parse_object_id(value: str) -> ObjectId:
    """Strictly parse a 24-hex id. Anything else is a 404 (never echo input)."""
    if not isinstance(value, str) or not _HEX24.match(value):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nahi mila")
    return ObjectId(value)
