"""Routerlər üçün ortaq köməkçilər."""

import re

from fastapi import HTTPException

from models import WEEK_DAYS


def not_found(what: str = "Məlumat"):
    return HTTPException(status_code=404, detail=f"{what} tapılmadı.")


def ensure_exists(conn, table: str, item_id, what: str) -> dict:
    r = conn.execute(f'SELECT * FROM "{table}" WHERE id = ?', (item_id,)).fetchone()
    if r is None:
        raise not_found(what)
    return dict(r)


def paginate(page: int, page_size: int) -> tuple[int, int, int]:
    page = max(1, page)
    page_size = min(max(1, page_size), 200)
    return page, page_size, (page - 1) * page_size


def search_pattern(q: str | None) -> str | None:
    from database import fold_text

    q = fold_text((q or "").strip())
    return f"%{q}%" if q else None


def digits_pattern(q: str | None) -> str | None:
    digits = re.sub(r"\D", "", q or "")
    return f"%{digits}%" if len(digits) >= 3 else None


def days_label(days: str | None) -> str:
    if not days:
        return ""
    names = [WEEK_DAYS.get(int(d)) for d in days.split(",") if d.strip().isdigit()]
    return ", ".join(n for n in names if n)


def days_list(days: str | None) -> list[int]:
    return [int(d) for d in (days or "").split(",") if d.strip().isdigit()]


def mask_card(number: str | None) -> str:
    digits = re.sub(r"\D", "", number or "")
    return f"•••• {digits[-4:]}" if len(digits) >= 4 else digits


def format_card(number: str | None) -> str:
    digits = re.sub(r"\D", "", number or "")
    return " ".join(digits[i:i + 4] for i in range(0, len(digits), 4))


def update_fields(conn, table: str, item_id: int, data: dict, touch: bool = True):
    if touch:
        from database import now
        data = {**data, "updated_at": now()}
    if not data:
        return
    sets = ", ".join(f'"{k}" = ?' for k in data)
    conn.execute(f'UPDATE "{table}" SET {sets} WHERE id = ?', (*data.values(), item_id))


def student_code(student_id: int) -> str:
    return f"IA-{student_id:05d}"
