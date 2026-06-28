"""Supabase Storage helper for uploading task completion proof images."""

import uuid

from fastapi import HTTPException, UploadFile, status

from .config import settings
from .supabase_client import get_client

_ALLOWED = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}
_MAX_BYTES = 10 * 1024 * 1024  # 10 MB


async def upload_proof_image(file: UploadFile) -> str:
    if file.content_type not in _ALLOWED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only JPG/PNG/WEBP/GIF images are allowed.")

    data = await file.read()
    if len(data) > _MAX_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Image must be 10 MB or smaller.")

    ext = _EXT.get(file.content_type, "bin")
    path = f"proofs/{uuid.uuid4()}.{ext}"

    client = await get_client()
    try:
        await client.storage.from_(settings.supabase_bucket).upload(
            path, data, {"content-type": file.content_type, "upsert": "false"}
        )
    except Exception as exc:  # surface storage/bucket errors as a clean 503
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            f"Image upload failed (check the '{settings.supabase_bucket}' bucket exists and is public): {exc}",
        )

    # Public URL is deterministic for a public bucket.
    base = settings.supabase_url.rstrip("/")
    return f"{base}/storage/v1/object/public/{settings.supabase_bucket}/{path}"
