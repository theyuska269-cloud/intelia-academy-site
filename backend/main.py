"""
Intelia Academy — kurs qeydiyyatı və admin idarəetmə sistemi (FastAPI).

İşə salmaq (backend qovluğunda):
    uvicorn main:app --reload --port 8000

və ya layihənin kök qovluğundan:
    uvicorn backend.main:app --reload --port 8000

Səhifələr:
    http://127.0.0.1:8000/register   -> tələbə qeydiyyatı (müştəriyə göndərilən link)
    http://127.0.0.1:8000/admin      -> admin panel
    http://127.0.0.1:8000/docs       -> API sənədləri
"""

import logging
import sqlite3
import sys
from contextlib import asynccontextmanager
from pathlib import Path

# Modulların həm "backend" qovluğundan, həm də kök qovluqdan işə salındıqda tapılması üçün
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.exceptions import RequestValidationError  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

import config  # noqa: E402
from database import init_db  # noqa: E402
from routers import (  # noqa: E402
    attendance, auth, cards, courses, dashboard, expenses, groups, payments, public, settings, students, teachers,
    users,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    logging.getLogger("intelia").info("Database hazırdır: %s", config.DB_PATH)
    yield


app = FastAPI(
    title="Intelia Academy API",
    version="2.0.0",
    description="Intelia Academy kurs qeydiyyatı və idarəetmə sistemi",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    # Render proxy arxasında FORWARDED_ALLOW_IPS=* olduqda scheme düzgün "https" gəlir
    if request.url.scheme == "https":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


# ---------------------------------------------------------------------------
# Validation xətalarını oxunaqlı Azərbaycan dilinə çevir
# ---------------------------------------------------------------------------

FIELD_LABELS = {
    "first_name": "Ad", "last_name": "Soyad", "full_name": "Ad Soyad", "phone": "Telefon",
    "education_level": "Təhsil səviyyəsi", "university": "Universitet", "specialty": "İxtisas",
    "course_id": "Kurs", "group_id": "Qrup", "card_id": "Kart", "receipt": "Ödəniş qəbzi",
    "name": "Ad", "price": "Qiymət", "duration": "Müddət", "bank_name": "Bank adı",
    "card_number": "Kart nömrəsi", "card_holder": "Kart sahibi", "amount": "Məbləğ",
    "username": "İstifadəçi adı", "password": "Şifrə", "new_password": "Yeni şifrə",
    "start_time": "Başlama saatı", "end_time": "Bitmə saatı", "capacity": "Tutum",
    "whatsapp_link": "WhatsApp linki", "telegram_link": "Telegram linki", "days": "Dərs günləri",
    "student_id": "Tələbə", "status": "Status", "email": "E-poçt", "graduation_status": "Təhsil vəziyyəti",
    "title": "Ad", "category": "Kateqoriya", "expense_date": "Tarix", "lesson_date": "Dərs tarixi",
    "group_id_att": "Qrup", "qr_code_url": "QR kod linki",
}


def _friendly(err: dict) -> tuple[str, str]:
    field = str(err["loc"][-1]) if err.get("loc") else ""
    label = FIELD_LABELS.get(field, field)
    kind = err.get("type", "")
    ctx = err.get("ctx") or {}
    if kind == "missing":
        msg = f"{label} mütləq doldurulmalıdır."
    elif kind == "string_too_short":
        msg = f"{label} ən azı {ctx.get('min_length')} simvol olmalıdır."
    elif kind == "string_too_long":
        msg = f"{label} ən çox {ctx.get('max_length')} simvol ola bilər."
    elif kind in ("int_parsing", "float_parsing", "int_type", "float_type"):
        msg = f"{label} düzgün rəqəm deyil."
    elif kind in ("greater_than_equal", "greater_than"):
        msg = f"{label} {ctx.get('ge', ctx.get('gt'))} və ya daha böyük olmalıdır."
    elif kind in ("less_than_equal", "less_than"):
        msg = f"{label} {ctx.get('le', ctx.get('lt'))} və ya daha kiçik olmalıdır."
    elif kind == "json_invalid":
        msg = "Göndərilən məlumat düzgün formatda deyil."
    else:
        msg = str(err.get("msg", "Məlumat düzgün deyil.")).removeprefix("Value error, ")
    return field, msg


@app.exception_handler(RequestValidationError)
async def validation_handler(_request: Request, exc: RequestValidationError):
    errors = [_friendly(e) for e in exc.errors()]
    return JSONResponse(
        status_code=422,
        content={
            "detail": errors[0][1] if errors else "Məlumat düzgün deyil.",
            "errors": [{"field": f, "message": m} for f, m in errors],
        },
    )


log = logging.getLogger("intelia")


# Database və server xətalarının texniki detalları istifadəçiyə göstərilmir, yalnız log-a yazılır
@app.exception_handler(sqlite3.IntegrityError)
async def integrity_handler(request: Request, exc: sqlite3.IntegrityError):
    log.warning("IntegrityError %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(status_code=409, content={"detail": "Bu əməliyyat mövcud məlumatlarla ziddiyyət təşkil edir. Məlumatları yoxlayın."})


@app.exception_handler(sqlite3.Error)
async def sqlite_handler(request: Request, exc: sqlite3.Error):
    log.exception("Database xətası %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Daxili xəta baş verdi. Zəhmət olmasa bir az sonra yenidən cəhd edin."})


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    log.exception("Gözlənilməz xəta %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Daxili xəta baş verdi. Zəhmət olmasa bir az sonra yenidən cəhd edin."})


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

for module in (auth, public, dashboard, students, courses, groups, teachers, cards, payments,
               attendance, expenses, settings, users):
    app.include_router(module.router)

# Qısa ünvan: POST /api/register == POST /api/public/register
app.add_api_route("/api/register", public.register, methods=["POST"], status_code=201, tags=["Qeydiyyat (açıq)"])


@app.get("/api", tags=["Sistem"])
def api_root():
    return {"system": "Intelia Academy", "message": "Intelia Academy API işləyir", "version": app.version}


@app.get("/health", tags=["Sistem"])
@app.get("/api/health", include_in_schema=False)
def health():
    from database import connect

    conn = connect()
    try:
        conn.execute("SELECT 1").fetchone()
    finally:
        conn.close()
    return {"status": "healthy", "database": "connected"}


# ---------------------------------------------------------------------------
# Frontend (eyni serverdən servis olunur -> CORS problemi olmur)
# ---------------------------------------------------------------------------

FRONTEND_FILES = {
    "index.html", "register.html",
    "style.css", "register.css", "common.css",
    "script.js", "register.js", "common.js",
}

app.mount("/assets", StaticFiles(directory=config.ASSETS_DIR), name="assets")


def _page(name: str) -> FileResponse:
    return FileResponse(config.FRONTEND_DIR / name, headers={"Cache-Control": "no-cache"})


@app.get("/", include_in_schema=False)
def home():
    return RedirectResponse("/register")


@app.get("/register", include_in_schema=False)
@app.get("/qeydiyyat", include_in_schema=False)
def register_page():
    return _page("register.html")


@app.get("/admin", include_in_schema=False)
def admin_page():
    return _page("index.html")


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return FileResponse(config.ASSETS_DIR / "logo.png")


@app.get("/{filename}", include_in_schema=False)
def frontend_file(filename: str):
    if filename not in FRONTEND_FILES or not (config.FRONTEND_DIR / filename).is_file():
        return JSONResponse(status_code=404, content={"detail": "Səhifə tapılmadı."})
    return _page(filename)
