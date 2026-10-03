import csv
import io
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from database import get_db, rows
from models import STUDENT_STATUSES
from routers.common import student_code
from routers.payments import SELECT_PAYMENTS, decorate as decorate_payment
from routers.students import SELECT_STUDENTS, decorate as decorate_student
from security import get_current_admin

router = APIRouter(tags=["Dashboard və hesabatlar"], dependencies=[Depends(get_current_admin)])


def _scalar(conn, sql: str, params=()):
    return conn.execute(sql, params).fetchone()[0]


# Borc = kursun qiyməti - təsdiqlənmiş ödənişlər (deaktiv tələbələr nəzərə alınmır)
DEBT_SQL = """
    SELECT COUNT(*) AS debtors, COALESCE(SUM(debt), 0) AS total FROM (
        SELECT COALESCE(c.price, 0) - (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
                                       WHERE p.student_id = s.id AND p.status = 'Təsdiqləndi') AS debt
        FROM students s JOIN courses c ON c.id = s.course_id
        WHERE s.status <> 'Deaktiv'
    ) WHERE debt > 0
"""


@router.get("/api/dashboard")
def dashboard(conn=Depends(get_db)):
    pay = {
        r["status"]: (r["n"], r["amount"])
        for r in conn.execute("SELECT status, COUNT(*) AS n, COALESCE(SUM(amount),0) AS amount FROM payments GROUP BY status")
    }
    month_start = date.today().replace(day=1).isoformat()
    debt = conn.execute(DEBT_SQL).fetchone()
    stats = {
        "total_students": _scalar(conn, "SELECT COUNT(*) FROM students"),
        "active_students": _scalar(conn, "SELECT COUNT(*) FROM students WHERE status = 'Aktiv'"),
        "new_applications": _scalar(conn, "SELECT COUNT(*) FROM students WHERE status = 'Yeni'"),
        "pending_payments": pay.get("Gözləyir", (0, 0))[0],
        "pending_amount": pay.get("Gözləyir", (0, 0))[1],
        "approved_payments": pay.get("Təsdiqləndi", (0, 0))[0],
        "approved_amount": pay.get("Təsdiqləndi", (0, 0))[1],
        "rejected_payments": pay.get("Rədd edildi", (0, 0))[0],
        "pending_applications": _scalar(conn, "SELECT COUNT(*) FROM students WHERE status IN ('Yeni', 'Əlaqə saxlanılıb')"),
        "groups_count": _scalar(conn, "SELECT COUNT(*) FROM groups"),
        "teachers_count": _scalar(conn, "SELECT COUNT(*) FROM teachers"),
        "debt_total": debt["total"],
        "debtors_count": debt["debtors"],
        "month_payments_count": _scalar(
            conn,
            "SELECT COUNT(*) FROM payments WHERE status = 'Təsdiqləndi' AND date(COALESCE(reviewed_at, created_at)) >= date(?)",
            (month_start,),
        ),
        "month_expenses": _scalar(conn, "SELECT COALESCE(SUM(amount),0) FROM expenses WHERE date(expense_date) >= date(?)", (month_start,)),
        "active_groups": _scalar(conn, "SELECT COUNT(*) FROM groups WHERE is_active = 1"),
        "active_courses": _scalar(conn, "SELECT COUNT(*) FROM courses WHERE is_active = 1"),
        "active_teachers": _scalar(conn, "SELECT COUNT(*) FROM teachers WHERE status = 'Aktiv'"),
        "active_cards": _scalar(conn, "SELECT COUNT(*) FROM cards WHERE is_active = 1"),
        "month_registrations": _scalar(conn, "SELECT COUNT(*) FROM students WHERE date(created_at) >= date(?)", (month_start,)),
        "month_revenue": _scalar(
            conn,
            "SELECT COALESCE(SUM(amount),0) FROM payments WHERE status = 'Təsdiqləndi' AND date(COALESCE(reviewed_at, created_at)) >= date(?)",
            (month_start,),
        ),
    }
    recent_applications = [
        decorate_student(r) for r in rows(conn.execute(SELECT_STUDENTS + " ORDER BY s.id DESC LIMIT 6"))
    ]
    recent_payments = [
        decorate_payment(r) for r in rows(conn.execute(SELECT_PAYMENTS + " ORDER BY p.id DESC LIMIT 6"))
    ]
    return {"stats": stats, "recent_applications": recent_applications, "recent_payments": recent_payments}


@router.get("/api/reports")
def reports(date_from: str | None = None, date_to: str | None = None, conn=Depends(get_db)):
    date_from = date_from or "0000-01-01"
    date_to = date_to or "9999-12-31"
    rng = (date_from, date_to)

    summary = {
        "registrations": _scalar(conn, "SELECT COUNT(*) FROM students WHERE date(created_at) BETWEEN date(?) AND date(?)", rng),
        "approved_amount": _scalar(conn, "SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='Təsdiqləndi' AND date(created_at) BETWEEN date(?) AND date(?)", rng),
        "approved_count": _scalar(conn, "SELECT COUNT(*) FROM payments WHERE status='Təsdiqləndi' AND date(created_at) BETWEEN date(?) AND date(?)", rng),
        "pending_amount": _scalar(conn, "SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='Gözləyir' AND date(created_at) BETWEEN date(?) AND date(?)", rng),
        "pending_count": _scalar(conn, "SELECT COUNT(*) FROM payments WHERE status='Gözləyir' AND date(created_at) BETWEEN date(?) AND date(?)", rng),
        "rejected_count": _scalar(conn, "SELECT COUNT(*) FROM payments WHERE status='Rədd edildi' AND date(created_at) BETWEEN date(?) AND date(?)", rng),
        "expenses_amount": _scalar(conn, "SELECT COALESCE(SUM(amount),0) FROM expenses WHERE date(expense_date) BETWEEN date(?) AND date(?)", rng),
    }
    summary["net_amount"] = summary["approved_amount"] - summary["expenses_amount"]
    debt = conn.execute(DEBT_SQL).fetchone()
    summary["debt_total"] = debt["total"]
    summary["debtors_count"] = debt["debtors"]

    by_course = rows(conn.execute(
        """SELECT c.id, c.name, c.price, c.is_active,
               (SELECT COUNT(*) FROM students s WHERE s.course_id = c.id AND date(s.created_at) BETWEEN date(?) AND date(?)) AS registrations,
               (SELECT COUNT(*) FROM students s WHERE s.course_id = c.id AND s.status = 'Aktiv') AS active_students,
               (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.course_id = c.id AND p.status = 'Təsdiqləndi' AND date(p.created_at) BETWEEN date(?) AND date(?)) AS approved_amount,
               (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.course_id = c.id AND p.status = 'Gözləyir' AND date(p.created_at) BETWEEN date(?) AND date(?)) AS pending_amount
           FROM courses c ORDER BY approved_amount DESC, c.name""",
        (*rng, *rng, *rng),
    ))

    by_group = rows(conn.execute(
        """SELECT g.id, g.name, g.capacity, g.is_active, c.name AS course_name, t.full_name AS teacher_name,
               (SELECT COUNT(*) FROM students s WHERE s.group_id = g.id AND s.status <> 'Deaktiv') AS students_count
           FROM groups g LEFT JOIN courses c ON c.id = g.course_id LEFT JOIN teachers t ON t.id = g.teacher_id
           ORDER BY g.is_active DESC, c.name, g.name"""
    ))

    monthly = rows(conn.execute(
        """WITH RECURSIVE months(m, n) AS (
               SELECT strftime('%Y-%m', 'now', 'localtime', 'start of month', '-11 months'), 0
               UNION ALL
               SELECT strftime('%Y-%m', date(m || '-01', '+1 month')), n + 1 FROM months WHERE n < 11
           )
           SELECT m AS month,
               (SELECT COUNT(*) FROM students s WHERE strftime('%Y-%m', s.created_at) = m) AS registrations,
               (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.status = 'Təsdiqləndi'
                   AND strftime('%Y-%m', COALESCE(p.reviewed_at, p.created_at)) = m) AS revenue,
               (SELECT COALESCE(SUM(e.amount),0) FROM expenses e WHERE strftime('%Y-%m', e.expense_date) = m) AS expenses
           FROM months ORDER BY m"""
    ))

    status_counts = {r["status"]: r["n"] for r in conn.execute("SELECT status, COUNT(*) AS n FROM students GROUP BY status")}
    by_status = [{"status": s, "count": status_counts.get(s, 0)} for s in STUDENT_STATUSES]

    by_card = rows(conn.execute(
        """SELECT COALESCE(p.card_label, 'Naməlum') AS card, COUNT(*) AS payments,
               COALESCE(SUM(CASE WHEN p.status='Təsdiqləndi' THEN p.amount END),0) AS approved_amount
           FROM payments p WHERE date(p.created_at) BETWEEN date(?) AND date(?)
           GROUP BY p.card_label ORDER BY approved_amount DESC""",
        rng,
    ))

    by_expense_category = rows(conn.execute(
        """SELECT category, COUNT(*) AS count, COALESCE(SUM(amount),0) AS amount FROM expenses
           WHERE date(expense_date) BETWEEN date(?) AND date(?) GROUP BY category ORDER BY amount DESC""",
        rng,
    ))

    return {
        "summary": summary,
        "by_expense_category": by_expense_category,
        "by_course": by_course,
        "by_group": by_group,
        "monthly": monthly,
        "by_status": by_status,
        "by_card": by_card,
    }


def _csv_response(filename: str, header: list[str], data: list[list]):
    buf = io.StringIO()
    buf.write("﻿")  # Excel UTF-8 üçün BOM
    writer = csv.writer(buf, delimiter=";")
    writer.writerow(header)
    writer.writerows(data)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/api/reports/export/{kind}")
def export(kind: str, conn=Depends(get_db)):
    if kind == "students":
        data = [
            [student_code(r["id"]), r["first_name"], r["last_name"], r["phone"], r["email"] or "", r["education_level"] or "",
             r["university"] or "", r["specialty"] or "", r["graduation_status"] or "", r["course_name"] or "",
             r["group_name"] or "", r["status"], r["payment_status"] or "Yoxdur", r["paid_amount"], r["debt"],
             r["source"], r["created_at"]]
            for r in rows(conn.execute(SELECT_STUDENTS + " ORDER BY s.id"))
        ]
        header = ["Kod", "Ad", "Soyad", "Telefon", "E-poçt", "Təhsil", "Universitet", "İxtisas", "Təhsil vəziyyəti",
                  "Kurs", "Qrup", "Status", "Ödəniş statusu", "Ödənilib (AZN)", "Borc (AZN)", "Mənbə", "Qeydiyyat tarixi"]
        return _csv_response("telebeler.csv", header, data)
    if kind == "payments":
        data = [
            [r["id"], student_code(r["student_id"]) if r["student_id"] else "", f"{r['first_name'] or ''} {r['last_name'] or ''}".strip(),
             r["student_phone"] or "", r["course_name"] or "", r["amount"], r["card_label"] or "", r["status"],
             r["paid_at"] or r["created_at"], r["reviewed_by_name"] or "", r["reviewed_at"] or "", r["admin_note"] or ""]
            for r in rows(conn.execute(SELECT_PAYMENTS + " ORDER BY p.id"))
        ]
        header = ["ID", "Tələbə kodu", "Tələbə", "Telefon", "Kurs", "Məbləğ (AZN)", "Kart", "Status",
                  "Ödəniş tarixi", "Yoxlayan", "Yoxlama tarixi", "Qeyd"]
        return _csv_response("odenisler.csv", header, data)
    if kind == "expenses":
        data = [
            [r["id"], r["expense_date"] or "", r["title"], r["category"], r["amount"], r["note"] or "", r["created_by_name"] or ""]
            for r in rows(conn.execute(
                "SELECT e.*, a.full_name AS created_by_name FROM expenses e LEFT JOIN admins a ON a.id = e.created_by "
                "ORDER BY e.expense_date, e.id"
            ))
        ]
        return _csv_response("xercler.csv", ["ID", "Tarix", "Ad", "Kateqoriya", "Məbləğ (AZN)", "Qeyd", "Əlavə edən"], data)
    raise HTTPException(status_code=404, detail="Hesabat növü tapılmadı.")
