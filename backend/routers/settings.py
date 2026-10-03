from fastapi import APIRouter, Depends

import config
from database import get_db
from models import (
    ATTENDANCE_STATUSES, EDUCATION_LEVELS, EXPENSE_CATEGORIES, GRADUATION_STATUSES, PAYMENT_STATUSES,
    STUDENT_STATUSES, TEACHER_STATUSES, WEEK_DAYS, SettingsUpdate,
)
from security import get_current_admin

router = APIRouter(prefix="/api/settings", tags=["Parametrlər"], dependencies=[Depends(get_current_admin)])


def read_settings(conn) -> dict:
    data = {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM settings")}
    data["registration_open"] = data.get("registration_open", "1") == "1"
    return data


@router.get("")
def get_settings(conn=Depends(get_db)):
    return {
        "settings": read_settings(conn),
        "meta": {
            "student_statuses": STUDENT_STATUSES,
            "payment_statuses": PAYMENT_STATUSES,
            "teacher_statuses": TEACHER_STATUSES,
            "education_levels": EDUCATION_LEVELS,
            "graduation_statuses": GRADUATION_STATUSES,
            "attendance_statuses": ATTENDANCE_STATUSES,
            "expense_categories": EXPENSE_CATEGORIES,
            "week_days": WEEK_DAYS,
            "max_upload_mb": config.MAX_UPLOAD_MB,
        },
    }


@router.put("")
def update_settings(data: SettingsUpdate, conn=Depends(get_db)):
    for key, value in data.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        if isinstance(value, bool):
            value = "1" if value else "0"
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, str(value).strip()),
        )
    conn.commit()
    return {"settings": read_settings(conn), "message": "Parametrlər yadda saxlanıldı."}
