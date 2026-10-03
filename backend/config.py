"""
Tətbiq parametrləri.

Bütün həssas dəyərlər backend/.env faylından oxunur.
Path-lər həmişə bu faylın yerləşdiyi qovluğa görə absolute qurulur,
ona görə server hansı qovluqdan işə salınmasından asılı olmayaraq
(Windows daxil) eyni database və uploads qovluğundan istifadə edir.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent

load_dotenv(BACKEND_DIR / ".env")


def _path_from_env(name: str, default: Path) -> Path:
    value = os.getenv(name, "").strip()
    if not value:
        return default
    path = Path(value)
    if not path.is_absolute():
        path = BACKEND_DIR / path
    return path.resolve()


def _int_from_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


SECRET_KEY = os.getenv("SECRET_KEY", "").strip()
if len(SECRET_KEY) < 32:
    raise RuntimeError(
        "SECRET_KEY backend/.env faylında təyin edilməyib və ya çox qısadır (min. 32 simvol). "
        "Yeni açar yaratmaq üçün: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
    )

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = _int_from_env("ACCESS_TOKEN_EXPIRE_MINUTES", 720)

DB_PATH = _path_from_env("DATABASE_PATH", BACKEND_DIR / "intelia.db")
UPLOAD_DIR = _path_from_env("UPLOAD_DIR", BACKEND_DIR / "uploads")
RECEIPT_DIR = UPLOAD_DIR / "receipts"
# Ehtiyat nüsxələr bazanın yanında saxlanılır (Render-də davamlı diskə düşür)
BACKUP_DIR = _path_from_env("BACKUP_DIR", DB_PATH.parent / "backups")

MAX_UPLOAD_MB = _int_from_env("MAX_UPLOAD_MB", 10)
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

FRONTEND_DIR = PROJECT_DIR
ASSETS_DIR = PROJECT_DIR / "assets"

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:8000,http://localhost:8000",
    ).split(",")
    if origin.strip()
]

# İlkin Super Adminlər. Şifrə yalnız admin bazada hələ şifrəsiz olduqda
# .env-dən götürülüb hash edilir; sonradan paneldən dəyişdirilən şifrə
# server restartında üzərinə yazılmır.
INITIAL_ADMINS = [
    {
        "username": "rahib",
        "full_name": "Rahib Məmmədov",
        "role": "Super Admin",
        "position": "Kurs rəhbəri",
        "password_env": "RAHIB_PASSWORD",
    },
    {
        "username": "yusif",
        "full_name": "Yusif Əlizadə",
        "role": "Super Admin",
        "position": "Super Admin",
        "password_env": "YUSIF_PASSWORD",
    },
]
