from fastapi import APIRouter, Depends, HTTPException

import uploads
from database import get_db, now, rows
from models import STUDENT_STATUSES, StudentIn, StudentUpdate
from routers.public import check_duplicate_email
from routers.common import (
    days_label,
    digits_pattern,
    ensure_exists,
    paginate,
    search_pattern,
    student_code,
    update_fields,
)
from security import get_current_admin

router = APIRouter(prefix="/api/students", tags=["Tələbələr"], dependencies=[Depends(get_current_admin)])

SELECT_STUDENTS = """
    SELECT s.*,
        c.name AS course_name, c.price AS course_price,
        g.name AS group_name, g.days AS group_days, g.start_time AS group_start_time, g.end_time AS group_end_time,
        (SELECT p.status FROM payments p WHERE p.student_id = s.id ORDER BY p.id DESC LIMIT 1) AS payment_status,
        (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.student_id = s.id AND p.status = 'Təsdiqləndi') AS paid_amount,
        (SELECT COUNT(*) FROM payments p WHERE p.student_id = s.id) AS payments_count,
        CASE WHEN s.course_id IS NULL OR s.status = 'Deaktiv' THEN 0
             ELSE MAX(COALESCE(c.price, 0) - (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
                      WHERE p.student_id = s.id AND p.status = 'Təsdiqləndi'), 0) END AS debt
    FROM students s
    LEFT JOIN courses c ON c.id = s.course_id
    LEFT JOIN groups g ON g.id = s.group_id
"""

# "Müraciətlər" bölməsi = hələ emal olunmamış qeydiyyatlar
APPLICATION_STATUSES = ("Yeni", "Əlaqə saxlanılıb")


def decorate(s: dict) -> dict:
    s["code"] = student_code(s["id"])
    s["full_name"] = f"{s['first_name']} {s['last_name']}"
    s["group_days_label"] = days_label(s.get("group_days"))
    return s


def build_filters(q=None, status=None, course_id=None, group_id=None, payment_status=None, view=None):
    where, params = [], []
    if view == "applications":
        where.append(f"s.status IN ({','.join('?' * len(APPLICATION_STATUSES))})")
        params.extend(APPLICATION_STATUSES)
    if status:
        where.append("s.status = ?")
        params.append(status)
    if course_id:
        where.append("s.course_id = ?")
        params.append(course_id)
    if group_id == 0:
        where.append("s.group_id IS NULL")
    elif group_id:
        where.append("s.group_id = ?")
        params.append(group_id)
    if payment_status == "Borclu":
        where.append(
            "s.course_id IS NOT NULL AND s.status <> 'Deaktiv' AND COALESCE(c.price, 0) > "
            "(SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.student_id = s.id AND p.status = 'Təsdiqləndi')"
        )
    elif payment_status == "Yoxdur":
        where.append("NOT EXISTS (SELECT 1 FROM payments p WHERE p.student_id = s.id)")
    elif payment_status:
        where.append("(SELECT p.status FROM payments p WHERE p.student_id = s.id ORDER BY p.id DESC LIMIT 1) = ?")
        params.append(payment_status)
    pattern = search_pattern(q)
    if pattern:
        cond = ("ilower(s.first_name || ' ' || s.last_name || ' ' || COALESCE(s.email,'') || ' ' || COALESCE(s.university,'') || ' ' || "
                "COALESCE(s.specialty,'') || ' ' || COALESCE(c.name,'') || ' ' || COALESCE(g.name,'')) LIKE ?")
        sub = [pattern]
        digits = digits_pattern(q)
        if digits:
            cond += " OR s.phone LIKE ?"
            sub.append(digits)
        code = (q or "").strip().upper().replace("IA-", "")
        if code.isdigit():
            cond += " OR s.id = ?"
            sub.append(int(code))
        where.append(f"({cond})")
        params.extend(sub)
    return (" WHERE " + " AND ".join(where)) if where else "", params


def get_student_full(conn, student_id: int) -> dict:
    r = conn.execute(SELECT_STUDENTS + " WHERE s.id = ?", (student_id,)).fetchone()
    if r is None:
        raise HTTPException(status_code=404, detail="Tələbə tapılmadı.")
    student = decorate(dict(r))
    student["payments"] = rows(conn.execute(
        """SELECT p.*, a.full_name AS reviewed_by_name
           FROM payments p LEFT JOIN admins a ON a.id = p.reviewed_by
           WHERE p.student_id = ? ORDER BY p.id DESC""",
        (student_id,),
    ))
    for p in student["payments"]:
        p["has_receipt"] = bool(p.pop("receipt_path", None))
    return student


def _validate_relations(conn, values: dict, current: dict | None = None):
    """Kurs/qrup mövcudluğunu yoxlayır, qrupun kursunu tələbəyə tətbiq edir."""
    if values.get("course_id"):
        ensure_exists(conn, "courses", values["course_id"], "Kurs")
    if values.get("group_id"):
        group = ensure_exists(conn, "groups", values["group_id"], "Qrup")
        if values.get("course_id") and values["course_id"] != group["course_id"]:
            raise HTTPException(status_code=422, detail="Seçilmiş qrup bu kursa aid deyil.")
        values["course_id"] = group["course_id"]
    elif "group_id" not in values and "course_id" in values and current and current.get("group_id"):
        group = conn.execute("SELECT course_id FROM groups WHERE id = ?", (current["group_id"],)).fetchone()
        if group and group["course_id"] != values["course_id"]:
            values["group_id"] = None


@router.get("")
def list_students(
    q: str | None = None,
    status: str | None = None,
    course_id: int | None = None,
    group_id: int | None = None,
    payment_status: str | None = None,
    view: str | None = None,
    page: int = 1,
    page_size: int = 20,
    conn=Depends(get_db),
):
    page, page_size, offset = paginate(page, page_size)
    where, params = build_filters(q, status, course_id, group_id, payment_status, view)
    total = conn.execute(
        "SELECT COUNT(*) FROM students s LEFT JOIN courses c ON c.id = s.course_id "
        "LEFT JOIN groups g ON g.id = s.group_id" + where,
        params,
    ).fetchone()[0]
    items = [
        decorate(r) for r in rows(conn.execute(
            SELECT_STUDENTS + where + " ORDER BY s.id DESC LIMIT ? OFFSET ?", (*params, page_size, offset)
        ))
    ]
    counts = {
        r["status"]: r["n"]
        for r in conn.execute("SELECT status, COUNT(*) AS n FROM students GROUP BY status")
    }
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
        "status_counts": {s: counts.get(s, 0) for s in STUDENT_STATUSES},
    }


@router.get("/{student_id}")
def get_student(student_id: int, conn=Depends(get_db)):
    return get_student_full(conn, student_id)


@router.post("", status_code=201)
def create_student(data: StudentIn, conn=Depends(get_db)):
    values = data.model_dump()
    _validate_relations(conn, values)
    check_duplicate_email(conn, values.get("email"), values["phone"], values.get("course_id"))
    if values.get("course_id"):
        dup = conn.execute(
            "SELECT id FROM students WHERE phone = ? AND course_id = ? AND status <> 'Deaktiv'",
            (values["phone"], values["course_id"]),
        ).fetchone()
        if dup:
            raise HTTPException(status_code=409, detail=f"Bu nömrə ilə həmin kursda artıq tələbə var ({student_code(dup['id'])}).")
    ts = now()
    cur = conn.execute(
        """INSERT INTO students (first_name, last_name, phone, email, education_level, university, specialty,
               graduation_status, course_id, group_id, status, source, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Admin', ?, ?, ?)""",
        (values["first_name"], values["last_name"], values["phone"], values["email"], values["education_level"],
         values["university"], values["specialty"], values["graduation_status"], values["course_id"],
         values["group_id"], values["status"], values["note"], ts, ts),
    )
    conn.commit()
    return get_student_full(conn, cur.lastrowid)


@router.put("/{student_id}")
def update_student(student_id: int, data: StudentUpdate, conn=Depends(get_db)):
    current = ensure_exists(conn, "students", student_id, "Tələbə")
    values = data.model_dump(exclude_unset=True)
    for key in ("first_name", "last_name", "phone", "status"):
        if key in values and values[key] is None:
            values.pop(key)
    _validate_relations(conn, values, current)
    if values.get("email"):
        check_duplicate_email(
            conn, values["email"], values.get("phone", current["phone"]),
            values.get("course_id", current["course_id"]), exclude_id=student_id,
        )
    update_fields(conn, "students", student_id, values)
    conn.commit()
    return get_student_full(conn, student_id)


@router.delete("/{student_id}")
def delete_student(student_id: int, conn=Depends(get_db)):
    ensure_exists(conn, "students", student_id, "Tələbə")
    receipts = [r["receipt_path"] for r in conn.execute(
        "SELECT receipt_path FROM payments WHERE student_id = ?", (student_id,)
    )]
    conn.execute("DELETE FROM students WHERE id = ?", (student_id,))
    conn.commit()
    for path in receipts:
        uploads.delete(path)
    return {"message": "Tələbə və ona aid ödənişlər silindi."}
