from fastapi import APIRouter, Depends, HTTPException

from database import get_db, now, rows
from models import ATTENDANCE_STATUSES, AttendanceSave
from routers.common import days_label, ensure_exists, student_code
from security import get_current_admin

router = APIRouter(prefix="/api/attendance", tags=["Davamiyyət"], dependencies=[Depends(get_current_admin)])

# Davamiyyət faizində "Gecikdi" iştirak sayılır
PRESENT = ("İştirak etdi", "Gecikdi")


@router.get("")
def get_attendance(group_id: int, lesson_date: str, conn=Depends(get_db)):
    group = ensure_exists(conn, "groups", group_id, "Qrup")
    students = rows(conn.execute(
        """SELECT s.id, s.first_name, s.last_name, s.phone, s.status AS student_status,
               a.status, a.note,
               (SELECT COUNT(*) FROM attendance x WHERE x.student_id = s.id AND x.group_id = ?) AS total_lessons,
               (SELECT COUNT(*) FROM attendance x WHERE x.student_id = s.id AND x.group_id = ?
                    AND x.status IN (?, ?)) AS present_lessons
           FROM students s
           LEFT JOIN attendance a ON a.student_id = s.id AND a.group_id = ? AND a.lesson_date = ?
           WHERE s.group_id = ? AND s.status <> 'Deaktiv'
           ORDER BY s.first_name COLLATE NOCASE, s.last_name COLLATE NOCASE""",
        (group_id, group_id, *PRESENT, group_id, lesson_date, group_id),
    ))
    for s in students:
        s["code"] = student_code(s["id"])
        s["full_name"] = f"{s['first_name']} {s['last_name']}"
        s["rate"] = round(s["present_lessons"] * 100 / s["total_lessons"]) if s["total_lessons"] else None

    history = rows(conn.execute(
        """SELECT lesson_date,
               COUNT(*) AS marked,
               SUM(CASE WHEN status IN (?, ?) THEN 1 ELSE 0 END) AS present
           FROM attendance WHERE group_id = ?
           GROUP BY lesson_date ORDER BY lesson_date DESC LIMIT 30""",
        (*PRESENT, group_id),
    ))
    return {
        "group": {**group, "days_label": days_label(group["days"])},
        "lesson_date": lesson_date,
        "students": students,
        "history": history,
        "statuses": ATTENDANCE_STATUSES,
        "is_saved": any(s["status"] for s in students),
    }


@router.put("")
def save_attendance(data: AttendanceSave, admin=Depends(get_current_admin), conn=Depends(get_db)):
    ensure_exists(conn, "groups", data.group_id, "Qrup")
    if not data.records:
        raise HTTPException(status_code=422, detail="Qeyd ediləcək tələbə yoxdur.")
    member_ids = {
        r["id"] for r in conn.execute("SELECT id FROM students WHERE group_id = ?", (data.group_id,))
    }
    foreign = [r.student_id for r in data.records if r.student_id not in member_ids]
    if foreign:
        raise HTTPException(status_code=422, detail="Bəzi tələbələr bu qrupa aid deyil. Səhifəni yeniləyin.")

    ts = now()
    for r in data.records:
        conn.execute(
            """INSERT INTO attendance (group_id, student_id, lesson_date, status, note, marked_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(group_id, student_id, lesson_date)
               DO UPDATE SET status = excluded.status, note = excluded.note,
                             marked_by = excluded.marked_by, updated_at = excluded.updated_at""",
            (data.group_id, r.student_id, data.lesson_date, r.status, r.note, admin["id"], ts, ts),
        )
    conn.commit()
    return {"message": f"{len(data.records)} tələbənin davamiyyəti yadda saxlanıldı."}


@router.delete("")
def clear_attendance(group_id: int, lesson_date: str, conn=Depends(get_db)):
    cur = conn.execute("DELETE FROM attendance WHERE group_id = ? AND lesson_date = ?", (group_id, lesson_date))
    conn.commit()
    return {"message": f"{cur.rowcount} qeyd silindi."}
