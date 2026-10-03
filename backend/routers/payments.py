from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

import uploads
from database import get_db, now, rows
from models import PAYMENT_STATUSES, PaymentUpdate
from routers.common import digits_pattern, ensure_exists, mask_card, paginate, search_pattern, student_code
from security import get_current_admin

router = APIRouter(prefix="/api/payments", tags=["Ödənişlər"], dependencies=[Depends(get_current_admin)])

SELECT_PAYMENTS = """
    SELECT p.*,
        s.first_name, s.last_name, s.phone AS student_phone, s.status AS student_status,
        c.name AS course_name,
        k.bank_name AS card_bank, k.card_number AS card_number,
        a.full_name AS reviewed_by_name
    FROM payments p
    LEFT JOIN students s ON s.id = p.student_id
    LEFT JOIN courses c ON c.id = p.course_id
    LEFT JOIN cards k ON k.id = p.card_id
    LEFT JOIN admins a ON a.id = p.reviewed_by
"""


def card_label(card: dict | None) -> str | None:
    if not card:
        return None
    return f"{card['bank_name']} {mask_card(card['card_number'])} — {card['card_holder']}"


def decorate(p: dict) -> dict:
    p["has_receipt"] = bool(p.pop("receipt_path", None))
    p.pop("card_number", None)
    if p.get("student_id"):
        p["student_code"] = student_code(p["student_id"])
        p["student_name"] = f"{p.get('first_name') or ''} {p.get('last_name') or ''}".strip()
    return p


def _get(conn, payment_id: int) -> dict:
    r = conn.execute(SELECT_PAYMENTS + " WHERE p.id = ?", (payment_id,)).fetchone()
    if r is None:
        raise HTTPException(status_code=404, detail="Ödəniş tapılmadı.")
    return decorate(dict(r))


def apply_status_side_effects(conn, payment: dict, new_status: str, admin_id: int):
    """Ödəniş təsdiqlənəndə tələbənin qeydiyyatını tamamlanmış sayır."""
    if new_status == "Təsdiqləndi" and payment.get("student_id"):
        conn.execute(
            "UPDATE students SET status = 'Qeydiyyat tamamlandı', updated_at = ? "
            "WHERE id = ? AND status IN ('Yeni', 'Əlaqə saxlanılıb')",
            (now(), payment["student_id"]),
        )


@router.get("")
def list_payments(
    q: str | None = None,
    status: str | None = None,
    course_id: int | None = None,
    card_id: int | None = None,
    student_id: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    page: int = 1,
    page_size: int = 20,
    conn=Depends(get_db),
):
    page, page_size, offset = paginate(page, page_size)
    where, params = [], []
    if status:
        where.append("p.status = ?")
        params.append(status)
    if course_id:
        where.append("p.course_id = ?")
        params.append(course_id)
    if card_id:
        where.append("p.card_id = ?")
        params.append(card_id)
    if student_id:
        where.append("p.student_id = ?")
        params.append(student_id)
    if date_from:
        where.append("date(p.created_at) >= date(?)")
        params.append(date_from)
    if date_to:
        where.append("date(p.created_at) <= date(?)")
        params.append(date_to)
    pattern = search_pattern(q)
    if pattern:
        cond = "ilower(COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,'') || ' ' || COALESCE(c.name,'') || ' ' || COALESCE(p.card_label,'')) LIKE ?"
        sub = [pattern]
        digits = digits_pattern(q)
        if digits:
            cond += " OR s.phone LIKE ?"
            sub.append(digits)
        where.append(f"({cond})")
        params.extend(sub)
    where_sql = (" WHERE " + " AND ".join(where)) if where else ""

    total, total_amount = conn.execute(
        "SELECT COUNT(*), COALESCE(SUM(p.amount), 0) FROM payments p LEFT JOIN students s ON s.id = p.student_id "
        "LEFT JOIN courses c ON c.id = p.course_id" + where_sql,
        params,
    ).fetchone()
    items = [decorate(r) for r in rows(conn.execute(
        SELECT_PAYMENTS + where_sql + " ORDER BY p.id DESC LIMIT ? OFFSET ?", (*params, page_size, offset)
    ))]
    summary = {
        r["status"]: {"count": r["n"], "amount": r["amount"]}
        for r in conn.execute("SELECT status, COUNT(*) AS n, COALESCE(SUM(amount),0) AS amount FROM payments GROUP BY status")
    }
    return {
        "items": items,
        "total": total,
        "total_amount": total_amount,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
        "summary": {s: summary.get(s, {"count": 0, "amount": 0}) for s in PAYMENT_STATUSES},
    }


@router.get("/{payment_id}")
def get_payment(payment_id: int, conn=Depends(get_db)):
    return _get(conn, payment_id)


@router.post("", status_code=201)
async def create_payment(
    student_id: int = Form(...),
    amount: float = Form(..., ge=0, le=100000),
    card_id: Optional[int] = Form(None),
    status: str = Form("Gözləyir"),
    admin_note: Optional[str] = Form(None),
    paid_at: Optional[str] = Form(None),
    receipt: Optional[UploadFile] = File(None),
    admin=Depends(get_current_admin),
    conn=Depends(get_db),
):
    """Admin tərəfindən əl ilə ödəniş qeydi (nağd, köçürmə və s.)."""
    if status not in PAYMENT_STATUSES:
        raise HTTPException(status_code=422, detail="Ödəniş statusu düzgün deyil.")
    student = ensure_exists(conn, "students", student_id, "Tələbə")
    card = ensure_exists(conn, "cards", card_id, "Kart") if card_id else None

    receipt_path = receipt_name = None
    if receipt is not None and receipt.filename:
        receipt_path, receipt_name = await uploads.save_receipt(receipt)

    ts = now()
    reviewed = status != "Gözləyir"
    cur = conn.execute(
        """INSERT INTO payments (student_id, course_id, card_id, card_label, amount, receipt_path, receipt_name,
               status, admin_note, paid_at, reviewed_by, reviewed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (student_id, student["course_id"], card_id, card_label(card) or "Nağd / digər", amount, receipt_path,
         receipt_name, status, (admin_note or "").strip() or None, paid_at or ts,
         admin["id"] if reviewed else None, ts if reviewed else None, ts, ts),
    )
    payment = {"student_id": student_id}
    apply_status_side_effects(conn, payment, status, admin["id"])
    conn.commit()
    return _get(conn, cur.lastrowid)


@router.put("/{payment_id}")
def update_payment(payment_id: int, data: PaymentUpdate, admin=Depends(get_current_admin), conn=Depends(get_db)):
    payment = ensure_exists(conn, "payments", payment_id, "Ödəniş")
    values = data.model_dump(exclude_unset=True)
    if values.get("status") is None:
        values.pop("status", None)
    if values.get("amount") is None:
        values.pop("amount", None)
    if "card_id" in values:
        card = ensure_exists(conn, "cards", values["card_id"], "Kart") if values["card_id"] else None
        values["card_label"] = card_label(card) or "Nağd / digər"

    ts = now()
    if "status" in values and values["status"] != payment["status"]:
        if values["status"] == "Gözləyir":
            values["reviewed_by"] = None
            values["reviewed_at"] = None
        else:
            values["reviewed_by"] = admin["id"]
            values["reviewed_at"] = ts
        apply_status_side_effects(conn, payment, values["status"], admin["id"])

    values["updated_at"] = ts
    sets = ", ".join(f'"{k}" = ?' for k in values)
    conn.execute(f"UPDATE payments SET {sets} WHERE id = ?", (*values.values(), payment_id))
    conn.commit()
    return _get(conn, payment_id)


@router.delete("/{payment_id}")
def delete_payment(payment_id: int, conn=Depends(get_db)):
    payment = ensure_exists(conn, "payments", payment_id, "Ödəniş")
    conn.execute("DELETE FROM payments WHERE id = ?", (payment_id,))
    conn.commit()
    uploads.delete(payment["receipt_path"])
    return {"message": "Ödəniş silindi."}


@router.get("/{payment_id}/receipt")
def download_receipt(payment_id: int, conn=Depends(get_db)):
    payment = ensure_exists(conn, "payments", payment_id, "Ödəniş")
    path = uploads.resolve(payment["receipt_path"])
    if path is None:
        raise HTTPException(status_code=404, detail="Qəbz faylı tapılmadı.")
    filename = payment["receipt_name"] or path.name
    return FileResponse(
        path,
        media_type=uploads.media_type(path),
        filename=filename,
        content_disposition_type="inline",
        headers={"Cache-Control": "private, no-store"},
    )
