from datetime import date

from fastapi import APIRouter, Depends

from database import get_db, now, rows
from models import EXPENSE_CATEGORIES, ExpenseIn
from routers.common import ensure_exists, paginate, search_pattern
from security import get_current_admin

router = APIRouter(prefix="/api/expenses", tags=["Xərclər"], dependencies=[Depends(get_current_admin)])

_SELECT = """
    SELECT e.*, a.full_name AS created_by_name
    FROM expenses e LEFT JOIN admins a ON a.id = e.created_by
"""


def _get(conn, expense_id: int) -> dict:
    return dict(conn.execute(_SELECT + " WHERE e.id = ?", (expense_id,)).fetchone())


@router.get("")
def list_expenses(
    q: str | None = None,
    category: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    page: int = 1,
    page_size: int = 20,
    conn=Depends(get_db),
):
    page, page_size, offset = paginate(page, page_size)
    where, params = [], []
    if category:
        where.append("e.category = ?")
        params.append(category)
    if date_from:
        where.append("date(e.expense_date) >= date(?)")
        params.append(date_from)
    if date_to:
        where.append("date(e.expense_date) <= date(?)")
        params.append(date_to)
    pattern = search_pattern(q)
    if pattern:
        where.append("ilower(e.title || ' ' || COALESCE(e.note,'') || ' ' || e.category) LIKE ?")
        params.append(pattern)
    where_sql = (" WHERE " + " AND ".join(where)) if where else ""

    total, total_amount = conn.execute(
        "SELECT COUNT(*), COALESCE(SUM(e.amount), 0) FROM expenses e" + where_sql, params
    ).fetchone()
    items = rows(conn.execute(
        _SELECT + where_sql + " ORDER BY e.expense_date DESC, e.id DESC LIMIT ? OFFSET ?", (*params, page_size, offset)
    ))
    by_category = rows(conn.execute(
        "SELECT e.category, COUNT(*) AS count, COALESCE(SUM(e.amount), 0) AS amount FROM expenses e"
        + where_sql + " GROUP BY e.category ORDER BY amount DESC",
        params,
    ))
    month_start = date.today().replace(day=1).isoformat()
    month_total = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE date(expense_date) >= date(?)", (month_start,)
    ).fetchone()[0]
    return {
        "items": items,
        "total": total,
        "total_amount": total_amount,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
        "by_category": by_category,
        "month_total": month_total,
        "categories": EXPENSE_CATEGORIES,
    }


@router.post("", status_code=201)
def create_expense(data: ExpenseIn, admin=Depends(get_current_admin), conn=Depends(get_db)):
    ts = now()
    cur = conn.execute(
        """INSERT INTO expenses (title, category, amount, expense_date, note, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (data.title, data.category, data.amount, data.expense_date, data.note, admin["id"], ts, ts),
    )
    conn.commit()
    return _get(conn, cur.lastrowid)


@router.put("/{expense_id}")
def update_expense(expense_id: int, data: ExpenseIn, conn=Depends(get_db)):
    ensure_exists(conn, "expenses", expense_id, "Xərc")
    conn.execute(
        "UPDATE expenses SET title = ?, category = ?, amount = ?, expense_date = ?, note = ?, updated_at = ? WHERE id = ?",
        (data.title, data.category, data.amount, data.expense_date, data.note, now(), expense_id),
    )
    conn.commit()
    return _get(conn, expense_id)


@router.delete("/{expense_id}")
def delete_expense(expense_id: int, conn=Depends(get_db)):
    ensure_exists(conn, "expenses", expense_id, "Xərc")
    conn.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
    conn.commit()
    return {"message": "Xərc silindi."}
