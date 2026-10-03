"""
Ödəniş qəbzlərinin təhlükəsiz saxlanması.

- Fayl adı istifadəçidən götürülmür (uuid ilə yaradılır) -> path traversal mümkün deyil.
- Faylın növü uzantıya görə yox, məzmununa (magic bytes) görə yoxlanılır.
- DB-də path həmişə "/" ilə nisbi saxlanılır (receipts/abc.png), oxunanda
  pathlib ilə UPLOAD_DIR-ə birləşdirilir -> Windows/Linux fərqi yoxdur.
"""

import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

import config

ALLOWED = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "webp": "image/webp",
    "heic": "image/heic",
    "pdf": "application/pdf",
}


def _detect(head: bytes) -> str | None:
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    if head.startswith(b"%PDF"):
        return "pdf"
    if head[4:8] == b"ftyp" and head[8:12] in (b"heic", b"heix", b"mif1", b"msf1", b"hevc"):
        return "heic"
    return None


async def save_receipt(file: UploadFile) -> tuple[str, str]:
    """Faylı yoxlayıb saxlayır. (nisbi_path, orijinal_ad) qaytarır."""
    if file is None or not file.filename:
        raise HTTPException(status_code=422, detail="Ödəniş qəbzini yükləyin.")

    data = bytearray()
    while chunk := await file.read(1024 * 256):
        data.extend(chunk)
        if len(data) > config.MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail=f"Fayl həcmi {config.MAX_UPLOAD_MB} MB-dan çox olmamalıdır.")
    if not data:
        raise HTTPException(status_code=422, detail="Yüklənən fayl boşdur.")

    ext = _detect(bytes(data[:16]))
    if ext is None:
        raise HTTPException(status_code=415, detail="Yalnız JPG, PNG, WEBP, HEIC şəkil və ya PDF faylı yükləyə bilərsiniz.")

    config.RECEIPT_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.{ext}"
    (config.RECEIPT_DIR / name).write_bytes(bytes(data))

    original = Path(file.filename).name[:120]
    return f"receipts/{name}", original


def resolve(relative: str | None) -> Path | None:
    if not relative:
        return None
    base = config.UPLOAD_DIR.resolve()
    path = (base / Path(*relative.replace("\\", "/").split("/"))).resolve()
    if base not in path.parents or not path.is_file():
        return None
    return path


def media_type(path: Path) -> str:
    return ALLOWED.get(path.suffix.lstrip(".").lower(), "application/octet-stream")


def delete(relative: str | None):
    path = resolve(relative)
    if path:
        try:
            path.unlink()
        except OSError:
            pass
