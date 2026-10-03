from fastapi import APIRouter, Depends, HTTPException

from database import get_db, now, rows
from models import CourseIn, CourseUpdate
from routers.common import ensure_exists, update_fields
from security import get_current_admin

router = APIRouter(prefix="/api/courses", tags=["Kurslar"], dependencies=[Depends(get_current_admin)])

_SELECT = """
    SELECT c.*,
        (SELECT COUNT(*) FROM groups g WHERE g.course_id = c.id) AS groups_count,
        (SELECT COUNT(*) FROM groups g WHERE g.course_id = c.id AND g.is_active = 1) AS active_groups_count,
        (SELECT COUNT(*) FROM students s WHERE s.course_id = c.id) AS students_count,
        (SELECT COUNT(*) FROM students s WHERE s.course_id = c.id AND s.status = 'Aktiv') AS active_students_count
    FROM courses c
"""


def _get(conn, course_id: int) -> dict:
    r = conn.execute(_SELECT + " WHERE c.id = ?", (course_id,)).fetchone()
    return dict(r)


def _check_unique(conn, name: str, exclude_id: int | None = None):
    r = conn.execute(
        "SELECT id FROM courses WHERE lower(name) = lower(?) AND id IS NOT ?", (name, exclude_id)
    ).fetchone()
    if r:
        raise HTTPException(status_code=409, detail="Bu adda kurs artıq mövcuddur.")


@router.get("")
def list_courses(active: bool | None = None, conn=Depends(get_db)):
    sql, params = _SELECT, []
    if active is not None:
        sql += " WHERE c.is_active = ?"
        params.append(1 if active else 0)
    sql += " ORDER BY c.is_active DESC, c.name COLLATE NOCASE"
    items = rows(conn.execute(sql, params))
    return {"items": items, "total": len(items)}


@router.get("/{course_id}")
def get_course(course_id: int, conn=Depends(get_db)):
    ensure_exists(conn, "courses", course_id, "Kurs")
    return _get(conn, course_id)


@router.post("", status_code=201)
def create_course(data: CourseIn, conn=Depends(get_db)):
    _check_unique(conn, data.name)
    ts = now()
    cur = conn.execute(
        "INSERT INTO courses (name, description, price, duration, is_active, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (data.name, data.description, data.price, data.duration, int(data.is_active), ts, ts),
    )
    conn.commit()
    return _get(conn, cur.lastrowid)


@router.put("/{course_id}")
def update_course(course_id: int, data: CourseUpdate, conn=Depends(get_db)):
    ensure_exists(conn, "courses", course_id, "Kurs")
    values = data.model_dump(exclude_unset=True)
    if values.get("name") is None:
        values.pop("name", None)
    if values.get("price") is None:
        values.pop("price", None)
    if "name" in values:
        _check_unique(conn, values["name"], course_id)
    if "is_active" in values:
        values["is_active"] = int(bool(values["is_active"]))
    update_fields(conn, "courses", course_id, values)
    conn.commit()
    return _get(conn, course_id)


@router.delete("/{course_id}")
def delete_course(course_id: int, conn=Depends(get_db)):
    course = ensure_exists(conn, "courses", course_id, "Kurs")
    groups = conn.execute("SELECT COUNT(*) FROM groups WHERE course_id = ?", (course_id,)).fetchone()[0]
    students = conn.execute("SELECT COUNT(*) FROM students WHERE course_id = ?", (course_id,)).fetchone()[0]
    if groups or students:
        raise HTTPException(
            status_code=409,
            detail=f"“{course['name']}” kursuna {groups} qrup və {students} tələbə bağlıdır. "
                   "Məlumatları itirməmək üçün kursu silmək əvəzinə deaktiv edin.",
        )
    conn.execute("DELETE FROM courses WHERE id = ?", (course_id,))
    conn.commit()
    return {"message": "Kurs silindi."}
