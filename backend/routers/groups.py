from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import get_db, now, rows
from models import GroupIn, GroupUpdate
from routers.common import days_label, days_list, ensure_exists, search_pattern, update_fields
from security import get_current_admin

router = APIRouter(prefix="/api/groups", tags=["Qruplar"], dependencies=[Depends(get_current_admin)])

SELECT_GROUPS = """
    SELECT g.*, c.name AS course_name, c.price AS course_price, c.is_active AS course_active,
        t.full_name AS teacher_name,
        (SELECT COUNT(*) FROM students s WHERE s.group_id = g.id AND s.status <> 'Deaktiv') AS students_count
    FROM groups g
    LEFT JOIN courses c ON c.id = g.course_id
    LEFT JOIN teachers t ON t.id = g.teacher_id
"""


def decorate(group: dict) -> dict:
    group["days_list"] = days_list(group.get("days"))
    group["days_label"] = days_label(group.get("days"))
    cap = group.get("capacity")
    group["seats_left"] = None if not cap else max(cap - (group.get("students_count") or 0), 0)
    return group


def _get(conn, group_id: int) -> dict:
    return decorate(dict(conn.execute(SELECT_GROUPS + " WHERE g.id = ?", (group_id,)).fetchone()))


def _check(conn, values: dict, exclude_id: int | None = None):
    if values.get("course_id"):
        ensure_exists(conn, "courses", values["course_id"], "Kurs")
    if values.get("teacher_id"):
        ensure_exists(conn, "teachers", values["teacher_id"], "Müəllim")
    start, end = values.get("start_time"), values.get("end_time")
    if start and end and end <= start:
        raise HTTPException(status_code=422, detail="Dərsin bitmə saatı başlama saatından sonra olmalıdır.")
    if values.get("name") and values.get("course_id"):
        dup = conn.execute(
            "SELECT id FROM groups WHERE lower(name) = lower(?) AND course_id = ? AND id IS NOT ?",
            (values["name"], values["course_id"], exclude_id),
        ).fetchone()
        if dup:
            raise HTTPException(status_code=409, detail="Bu kursda eyni adlı qrup artıq mövcuddur.")


@router.get("")
def list_groups(
    course_id: int | None = None,
    active: bool | None = None,
    q: str | None = None,
    conn=Depends(get_db),
):
    where, params = [], []
    if course_id:
        where.append("g.course_id = ?")
        params.append(course_id)
    if active is not None:
        where.append("g.is_active = ?")
        params.append(1 if active else 0)
    pattern = search_pattern(q)
    if pattern:
        where.append("ilower(g.name || ' ' || COALESCE(c.name,'') || ' ' || COALESCE(t.full_name,'')) LIKE ?")
        params.append(pattern)
    sql = SELECT_GROUPS + (" WHERE " + " AND ".join(where) if where else "")
    sql += " ORDER BY g.is_active DESC, c.name COLLATE NOCASE, g.name COLLATE NOCASE"
    items = [decorate(r) for r in rows(conn.execute(sql, params))]
    return {"items": items, "total": len(items)}


@router.get("/{group_id}")
def get_group(group_id: int, conn=Depends(get_db)):
    ensure_exists(conn, "groups", group_id, "Qrup")
    group = _get(conn, group_id)
    group["students"] = rows(conn.execute(
        "SELECT id, first_name, last_name, phone, status FROM students WHERE group_id = ? ORDER BY first_name",
        (group_id,),
    ))
    return group


@router.post("", status_code=201)
def create_group(data: GroupIn, conn=Depends(get_db)):
    values = data.model_dump()
    _check(conn, values)
    ts = now()
    cur = conn.execute(
        """INSERT INTO groups (name, course_id, teacher_id, days, start_time, end_time, start_date, capacity,
               whatsapp_link, telegram_link, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (data.name, data.course_id, data.teacher_id, data.days, data.start_time, data.end_time, data.start_date,
         data.capacity, data.whatsapp_link, data.telegram_link, int(data.is_active), ts, ts),
    )
    conn.commit()
    return _get(conn, cur.lastrowid)


@router.put("/{group_id}")
def update_group(group_id: int, data: GroupUpdate, conn=Depends(get_db)):
    current = ensure_exists(conn, "groups", group_id, "Qrup")
    values = data.model_dump(exclude_unset=True)
    for key in ("name", "course_id", "days", "is_active"):
        if key in values and values[key] is None:
            values.pop(key)
    _check(conn, {**current, **values}, group_id)
    if "is_active" in values:
        values["is_active"] = int(bool(values["is_active"]))
    update_fields(conn, "groups", group_id, values)
    if "course_id" in values and values["course_id"] != current["course_id"]:
        conn.execute("UPDATE students SET course_id = ? WHERE group_id = ?", (values["course_id"], group_id))
    conn.commit()
    return _get(conn, group_id)


@router.delete("/{group_id}")
def delete_group(group_id: int, conn=Depends(get_db)):
    ensure_exists(conn, "groups", group_id, "Qrup")
    conn.execute("DELETE FROM groups WHERE id = ?", (group_id,))
    conn.commit()
    return {"message": "Qrup silindi. Qrupdakı tələbələr qrupsuz qaldı."}


class GroupStudents(BaseModel):
    student_ids: list[int]


@router.post("/{group_id}/students")
def assign_students(group_id: int, data: GroupStudents, conn=Depends(get_db)):
    """Tələbələri qrupa bağlayır (tələbənin kursu qrupun kursuna uyğunlaşdırılır)."""
    group = ensure_exists(conn, "groups", group_id, "Qrup")
    if not data.student_ids:
        raise HTTPException(status_code=422, detail="Ən azı bir tələbə seçin.")
    if group["capacity"]:
        current = conn.execute(
            "SELECT COUNT(*) FROM students WHERE group_id = ? AND status <> 'Deaktiv'", (group_id,)
        ).fetchone()[0]
        new = conn.execute(
            f"SELECT COUNT(*) FROM students WHERE id IN ({','.join('?' * len(data.student_ids))}) "
            "AND (group_id IS NOT ? ) AND status <> 'Deaktiv'",
            (*data.student_ids, group_id),
        ).fetchone()[0]
        if current + new > group["capacity"]:
            raise HTTPException(status_code=409, detail=f"Qrupda yer çatmır (tutum: {group['capacity']}).")
    ts = now()
    for sid in data.student_ids:
        ensure_exists(conn, "students", sid, "Tələbə")
        conn.execute(
            "UPDATE students SET group_id = ?, course_id = ?, updated_at = ? WHERE id = ?",
            (group_id, group["course_id"], ts, sid),
        )
    conn.commit()
    return {"message": f"{len(data.student_ids)} tələbə qrupa əlavə edildi.", "group": _get(conn, group_id)}


@router.delete("/{group_id}/students/{student_id}")
def remove_student(group_id: int, student_id: int, conn=Depends(get_db)):
    cur = conn.execute(
        "UPDATE students SET group_id = NULL, updated_at = ? WHERE id = ? AND group_id = ?",
        (now(), student_id, group_id),
    )
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Tələbə bu qrupda tapılmadı.")
    conn.commit()
    return {"message": "Tələbə qrupdan çıxarıldı."}
