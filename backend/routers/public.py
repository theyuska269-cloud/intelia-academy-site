"""
Qeydiyyat səhifəsi üçün açıq (auth tələb etməyən) endpointlər.
Burada yalnız tələbəyə lazım olan minimum məlumat qaytarılır.
"""

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import ValidationError

import uploads
from database import get_db, now, rows
from models import EDUCATION_LEVELS, GRADUATION_STATUSES, WEEK_DAYS, StudentIn
from routers.common import days_label, days_list, format_card, student_code
from routers.payments import card_label
from security import LoginRateLimiter

router = APIRouter(prefix="/api/public", tags=["Qeydiyyat (açıq)"])

register_limiter = LoginRateLimiter(max_attempts=10, window_seconds=60 * 60)

PUBLIC_SETTINGS = ("registration_open", "contact_phone", "contact_whatsapp", "payment_note", "success_message")


def _settings(conn) -> dict:
    data = {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM settings")}
    result = {k: data.get(k) or "" for k in PUBLIC_SETTINGS}
    result["registration_open"] = data.get("registration_open", "1") == "1"
    return result


_GROUP_SQL = """
    SELECT g.id, g.name, g.course_id, g.days, g.start_time, g.end_time, g.start_date, g.capacity,
        g.whatsapp_link, g.telegram_link, t.full_name AS teacher_name,
        (SELECT COUNT(*) FROM students s WHERE s.group_id = g.id AND s.status <> 'Deaktiv') AS students_count
    FROM groups g
    JOIN courses c ON c.id = g.course_id AND c.is_active = 1
    LEFT JOIN teachers t ON t.id = g.teacher_id
    WHERE g.is_active = 1
"""


def _public_group(g: dict) -> dict:
    cap = g.get("capacity")
    seats_left = None if not cap else max(cap - g["students_count"], 0)
    return {
        "id": g["id"],
        "name": g["name"],
        "course_id": g["course_id"],
        "days": days_list(g["days"]),
        "days_label": days_label(g["days"]),
        "start_time": g["start_time"],
        "end_time": g["end_time"],
        "start_date": g["start_date"],
        "teacher_name": g["teacher_name"],
        "capacity": cap,
        "students_count": g["students_count"],
        "seats_left": seats_left,
        "is_full": seats_left == 0,
        "has_whatsapp": bool(g["whatsapp_link"]),
        "has_telegram": bool(g["telegram_link"]),
    }


@router.get("/config")
def public_config(conn=Depends(get_db)):
    return {
        "settings": _settings(conn),
        "education_levels": EDUCATION_LEVELS,
        "graduation_statuses": GRADUATION_STATUSES,
        "week_days": WEEK_DAYS,
    }


@router.get("/courses")
def public_courses(conn=Depends(get_db)):
    items = rows(conn.execute(
        """SELECT c.id, c.name, c.description, c.price, c.duration,
               (SELECT COUNT(*) FROM groups g WHERE g.course_id = c.id AND g.is_active = 1) AS groups_count
           FROM courses c WHERE c.is_active = 1 ORDER BY c.name COLLATE NOCASE"""
    ))
    return {"items": items}


@router.get("/groups")
def public_groups(course_id: Optional[int] = None, conn=Depends(get_db)):
    sql, params = _GROUP_SQL, []
    if course_id:
        sql += " AND g.course_id = ?"
        params.append(course_id)
    sql += " ORDER BY g.start_date, g.name COLLATE NOCASE"
    return {"items": [_public_group(g) for g in rows(conn.execute(sql, params))]}


@router.get("/cards")
def public_cards(conn=Depends(get_db)):
    items = rows(conn.execute(
        "SELECT id, bank_name, card_number, card_holder, qr_code_url, qr_payload FROM cards "
        "WHERE is_active = 1 ORDER BY sort_order, id"
    ))
    for c in items:
        c["card_number_formatted"] = format_card(c["card_number"])
    return {"items": items}


def check_duplicate_email(conn, email: str | None, phone: str, course_id: int | None, course_name: str = "",
                          exclude_id: int | None = None):
    """Eyni e-poçt: eyni kursa ikinci qeydiyyat və ya başqa telefonla istifadə qadağandır."""
    if not email:
        return
    matches = conn.execute(
        "SELECT id, phone, course_id FROM students WHERE lower(email) = lower(?) AND status <> 'Deaktiv' AND id IS NOT ?",
        (email, exclude_id),
    ).fetchall()
    for m in matches:
        if course_id and m["course_id"] == course_id:
            raise HTTPException(
                status_code=409,
                detail=f"Bu e-poçt ilə {('“' + course_name + '” kursuna ') if course_name else 'bu kursa '}artıq qeydiyyat "
                       f"edilib (müraciət kodu: {student_code(m['id'])}).",
            )
    if any(m["phone"] != phone for m in matches):
        raise HTTPException(
            status_code=409,
            detail="Bu e-poçt ünvanı başqa telefon nömrəsi ilə qeydiyyatdan keçib. Başqa e-poçt daxil edin və ya bizimlə əlaqə saxlayın.",
        )


def registration_qr_svg(code: str, full_name: str, course_name: str, group_name: str) -> str | None:
    """Qeydiyyat təsdiqi üçün QR kod (SVG). Admin skan edərək tələbəni kodla tapa bilər."""
    try:
        import io

        import qrcode
        import qrcode.image.svg
    except ImportError:  # qrcode quraşdırılmayıbsa qeydiyyat yenə də işləyir
        return None
    payload = f"INTELIA ACADEMY\nQeydiyyat kodu: {code}\nTələbə: {full_name}\nKurs: {course_name}\nQrup: {group_name}"
    img = qrcode.make(payload, image_factory=qrcode.image.svg.SvgPathImage, box_size=10, border=2,
                      error_correction=qrcode.constants.ERROR_CORRECT_M)
    buf = io.BytesIO()
    img.save(buf)
    svg = buf.getvalue().decode("utf-8")
    svg = svg[svg.index("<svg"):]
    # Ölçünü CSS idarə etsin
    import re
    return re.sub(r'\s(width|height)="[^"]*"', "", svg, count=2)


def _validation_message(exc: ValidationError) -> str:
    err = exc.errors()[0]
    msg = str(err.get("msg", "Məlumat düzgün deyil."))
    return msg.removeprefix("Value error, ")


@router.post("/register", status_code=201)
async def register(
    request: Request,
    first_name: str = Form(...),
    last_name: str = Form(...),
    phone: str = Form(...),
    email: str = Form(...),
    education_level: str = Form(...),
    university: Optional[str] = Form(None),
    specialty: Optional[str] = Form(None),
    graduation_status: Optional[str] = Form(None),
    course_id: int = Form(...),
    group_id: int = Form(...),
    card_id: int = Form(...),
    receipt: UploadFile = File(...),
    conn=Depends(get_db),
):
    settings = _settings(conn)
    if not settings["registration_open"]:
        raise HTTPException(status_code=403, detail="Qeydiyyat hazırda bağlıdır.")

    client_ip = request.client.host if request.client else "unknown"
    register_limiter.check(f"register:{client_ip}")

    try:
        student = StudentIn(
            first_name=first_name, last_name=last_name, phone=phone, email=email, education_level=education_level,
            university=university, specialty=specialty, graduation_status=graduation_status,
            course_id=course_id, group_id=group_id,
        )
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=_validation_message(exc))

    if student.education_level not in EDUCATION_LEVELS:
        raise HTTPException(status_code=422, detail="Təhsil səviyyəsini seçin.")
    if not student.email:
        raise HTTPException(status_code=422, detail="E-poçt ünvanını daxil edin.")
    if student.education_level != "Orta təhsil" and not student.graduation_status:
        raise HTTPException(status_code=422, detail="Universiteti bitirib-bitirmədiyinizi seçin.")

    course = conn.execute("SELECT * FROM courses WHERE id = ? AND is_active = 1", (course_id,)).fetchone()
    if course is None:
        raise HTTPException(status_code=422, detail="Seçilmiş kurs mövcud deyil və ya aktiv deyil.")

    group = conn.execute(_GROUP_SQL + " AND g.id = ?", (group_id,)).fetchone()
    if group is None or group["course_id"] != course_id:
        raise HTTPException(status_code=422, detail="Seçilmiş qrup bu kursa aid deyil və ya aktiv deyil.")
    group = dict(group)
    if group["capacity"] and group["students_count"] >= group["capacity"]:
        raise HTTPException(status_code=409, detail="Bu qrupda boş yer qalmayıb. Başqa qrup seçin.")

    card = conn.execute("SELECT * FROM cards WHERE id = ? AND is_active = 1", (card_id,)).fetchone()
    if card is None:
        raise HTTPException(status_code=422, detail="Seçilmiş kart aktiv deyil. Başqa kart seçin.")

    dup = conn.execute(
        "SELECT id FROM students WHERE phone = ? AND course_id = ? AND status <> 'Deaktiv'",
        (student.phone, course_id),
    ).fetchone()
    if dup:
        raise HTTPException(
            status_code=409,
            detail=f"Bu telefon nömrəsi ilə “{course['name']}” kursuna artıq müraciət edilib "
                   f"(müraciət kodu: {student_code(dup['id'])}). Zəhmət olmasa bizimlə əlaqə saxlayın.",
        )
    check_duplicate_email(conn, student.email, student.phone, course_id, course["name"])

    receipt_path, receipt_name = await uploads.save_receipt(receipt)

    ts = now()
    try:
        cur = conn.execute(
            """INSERT INTO students (first_name, last_name, phone, email, education_level, university, specialty,
                   graduation_status, course_id, group_id, status, source, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Yeni', 'Online qeydiyyat', ?, ?)""",
            (student.first_name, student.last_name, student.phone, student.email, student.education_level,
             student.university, student.specialty, student.graduation_status, course_id, group_id, ts, ts),
        )
        student_id = cur.lastrowid
        conn.execute(
            """INSERT INTO payments (student_id, course_id, card_id, card_label, amount, receipt_path, receipt_name,
                   status, paid_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'Gözləyir', ?, ?, ?)""",
            (student_id, course_id, card_id, card_label(dict(card)), course["price"], receipt_path,
             receipt_name, ts, ts, ts),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        uploads.delete(receipt_path)
        raise

    register_limiter.fail(f"register:{client_ip}")

    code = student_code(student_id)
    return {
        "message": settings["success_message"],
        "student_code": code,
        "qr_svg": registration_qr_svg(code, f"{student.first_name} {student.last_name}", course["name"], group["name"]),
        "full_name": f"{student.first_name} {student.last_name}",
        "email": student.email,
        "course_name": course["name"],
        "group_name": group["name"],
        "days_label": days_label(group["days"]),
        "start_time": group["start_time"],
        "end_time": group["end_time"],
        "amount": course["price"],
        "payment_status": "Gözləyir",
        "whatsapp_link": group["whatsapp_link"],
        "telegram_link": group["telegram_link"],
    }
