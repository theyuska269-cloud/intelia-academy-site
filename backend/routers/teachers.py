from fastapi import APIRouter, Depends

from database import get_db, now, rows
from models import TeacherIn, TeacherUpdate
from routers.common import ensure_exists, search_pattern, update_fields
from security import get_current_admin

router = APIRouter(prefix="/api/teachers", tags=["Müəllimlər"], dependencies=[Depends(get_current_admin)])

_SELECT = """
    SELECT t.*, c.name AS course_name,
        (SELECT GROUP_CONCAT(g.name, ', ') FROM groups g WHERE g.teacher_id = t.id) AS group_names,
        (SELECT COUNT(*) FROM groups g WHERE g.teacher_id = t.id) AS groups_count
    FROM teachers t
    LEFT JOIN courses c ON c.id = t.course_id
"""


def _get(conn, teacher_id: int) -> dict:
    return dict(conn.execute(_SELECT + " WHERE t.id = ?", (teacher_id,)).fetchone())


@router.get("")
def list_teachers(q: str | None = None, status: str | None = None, conn=Depends(get_db)):
    where, params = [], []
    pattern = search_pattern(q)
    if pattern:
        where.append("ilower(t.full_name || ' ' || COALESCE(t.phone,'') || ' ' || COALESCE(t.subject,'') || ' ' || COALESCE(c.name,'')) LIKE ?")
        params.append(pattern)
    if status:
        where.append("t.status = ?")
        params.append(status)
    sql = _SELECT + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY t.full_name COLLATE NOCASE"
    items = rows(conn.execute(sql, params))
    return {"items": items, "total": len(items)}


@router.post("", status_code=201)
def create_teacher(data: TeacherIn, conn=Depends(get_db)):
    if data.course_id:
        ensure_exists(conn, "courses", data.course_id, "Kurs")
    ts = now()
    cur = conn.execute(
        "INSERT INTO teachers (full_name, phone, subject, course_id, status, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (data.full_name, data.phone, data.subject, data.course_id, data.status, ts, ts),
    )
    conn.commit()
    return _get(conn, cur.lastrowid)


@router.put("/{teacher_id}")
def update_teacher(teacher_id: int, data: TeacherUpdate, conn=Depends(get_db)):
    ensure_exists(conn, "teachers", teacher_id, "Müəllim")
    values = data.model_dump(exclude_unset=True)
    for key in ("full_name", "status"):
        if values.get(key) is None:
            values.pop(key, None)
    if values.get("course_id"):
        ensure_exists(conn, "courses", values["course_id"], "Kurs")
    update_fields(conn, "teachers", teacher_id, values)
    conn.commit()
    return _get(conn, teacher_id)


@router.delete("/{teacher_id}")
def delete_teacher(teacher_id: int, conn=Depends(get_db)):
    ensure_exists(conn, "teachers", teacher_id, "Müəllim")
    conn.execute("DELETE FROM teachers WHERE id = ?", (teacher_id,))
    conn.commit()
    return {"message": "Müəllim silindi. Bağlı qruplardan müəllim çıxarıldı."}
