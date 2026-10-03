from fastapi import APIRouter, Depends, HTTPException

from database import get_db, now, rows
from models import CardIn, CardUpdate
from routers.common import ensure_exists, format_card, update_fields
from security import get_current_admin

router = APIRouter(prefix="/api/cards", tags=["Kartlar"], dependencies=[Depends(get_current_admin)])

_SELECT = """
    SELECT k.*,
        (SELECT COUNT(*) FROM payments p WHERE p.card_id = k.id) AS payments_count,
        (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.card_id = k.id AND p.status = 'Təsdiqləndi') AS approved_total
    FROM cards k
"""


def decorate(card: dict) -> dict:
    card["card_number_formatted"] = format_card(card.get("card_number"))
    return card


def _get(conn, card_id: int) -> dict:
    return decorate(dict(conn.execute(_SELECT + " WHERE k.id = ?", (card_id,)).fetchone()))


def _check_unique(conn, number: str, exclude_id: int | None = None):
    if conn.execute("SELECT id FROM cards WHERE card_number = ? AND id IS NOT ?", (number, exclude_id)).fetchone():
        raise HTTPException(status_code=409, detail="Bu kart nömrəsi artıq əlavə edilib.")


@router.get("")
def list_cards(active: bool | None = None, conn=Depends(get_db)):
    sql, params = _SELECT, []
    if active is not None:
        sql += " WHERE k.is_active = ?"
        params.append(1 if active else 0)
    sql += " ORDER BY k.is_active DESC, k.sort_order, k.id"
    items = [decorate(r) for r in rows(conn.execute(sql, params))]
    return {"items": items, "total": len(items)}


@router.post("", status_code=201)
def create_card(data: CardIn, conn=Depends(get_db)):
    _check_unique(conn, data.card_number)
    ts = now()
    cur = conn.execute(
        "INSERT INTO cards (bank_name, card_number, card_holder, qr_code_url, qr_payload, sort_order, is_active, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (data.bank_name, data.card_number, data.card_holder, data.qr_code_url, data.qr_payload, data.sort_order,
         int(data.is_active), ts, ts),
    )
    conn.commit()
    return _get(conn, cur.lastrowid)


@router.put("/{card_id}")
def update_card(card_id: int, data: CardUpdate, conn=Depends(get_db)):
    ensure_exists(conn, "cards", card_id, "Kart")
    values = data.model_dump(exclude_unset=True)
    for key in ("bank_name", "card_number", "card_holder", "sort_order", "is_active"):
        if key in values and values[key] is None:
            values.pop(key)
    if "card_number" in values:
        _check_unique(conn, values["card_number"], card_id)
    if "is_active" in values:
        values["is_active"] = int(bool(values["is_active"]))
    update_fields(conn, "cards", card_id, values)
    conn.commit()
    return _get(conn, card_id)


@router.delete("/{card_id}")
def delete_card(card_id: int, conn=Depends(get_db)):
    ensure_exists(conn, "cards", card_id, "Kart")
    # Ödəniş tarixçəsində kart məlumatı card_label sütununda saxlanılır
    conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    conn.commit()
    return {"message": "Kart silindi. Ödəniş tarixçəsi qorunur."}
