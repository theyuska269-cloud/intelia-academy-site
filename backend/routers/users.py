"""
/users CRUD — köhnə versiyadakı endpointlər qorunub, indi sistem istifadəçilərini (adminləri) idarə edir.
Bütün əməliyyatlar Super Admin tokeni tələb edir. Şifrə yalnız hash kimi saxlanılır və heç vaxt qaytarılmır.
"""

from fastapi import APIRouter, Depends, HTTPException

from database import get_db, now, rows
from models import UserCreate, UserPatch, UserReplace
from routers.common import ensure_exists
from security import hash_password, require_super_admin

router = APIRouter(prefix="/users", tags=["İstifadəçilər (adminlər)"], dependencies=[Depends(require_super_admin)])

_FIELDS = "id, full_name, username, role, position, is_active, last_login_at, created_at"


def _get(conn, user_id: int) -> dict:
    r = conn.execute(f"SELECT {_FIELDS} FROM admins WHERE id = ?", (user_id,)).fetchone()
    if r is None:
        raise HTTPException(status_code=404, detail="İstifadəçi tapılmadı.")
    return dict(r)


def _check_username(conn, username: str, exclude_id: int | None = None):
    if conn.execute("SELECT id FROM admins WHERE username = ? AND id IS NOT ?", (username, exclude_id)).fetchone():
        raise HTTPException(status_code=409, detail="Bu istifadəçi adı artıq mövcuddur.")


def _guard_last_super_admin(conn, user_id: int, new_role: str | None, new_active: bool | None, deleting: bool = False):
    """Sistemdə ən azı bir aktiv Super Admin qalmalıdır."""
    current = conn.execute("SELECT role, is_active FROM admins WHERE id = ?", (user_id,)).fetchone()
    if current is None or current["role"] != "Super Admin" or not current["is_active"]:
        return
    loses = deleting or (new_role is not None and new_role != "Super Admin") or (new_active is False)
    if not loses:
        return
    others = conn.execute(
        "SELECT COUNT(*) FROM admins WHERE role = 'Super Admin' AND is_active = 1 AND id <> ?", (user_id,)
    ).fetchone()[0]
    if others == 0:
        raise HTTPException(status_code=409, detail="Sistemdə ən azı bir aktiv Super Admin qalmalıdır.")


def _apply(conn, user_id: int, values: dict, me: dict):
    if "username" in values:
        _check_username(conn, values["username"], user_id)
    if user_id == me["id"] and (values.get("is_active") is False):
        raise HTTPException(status_code=409, detail="Öz hesabınızı deaktiv edə bilməzsiniz.")
    _guard_last_super_admin(conn, user_id, values.get("role"), values.get("is_active"))
    password = values.pop("password", None)
    if password:
        values["password_hash"] = hash_password(password)
    if "is_active" in values:
        values["is_active"] = int(bool(values["is_active"]))
    if values:
        sets = ", ".join(f'"{k}" = ?' for k in values)
        conn.execute(f"UPDATE admins SET {sets} WHERE id = ?", (*values.values(), user_id))
    conn.commit()


@router.get("")
def list_users(conn=Depends(get_db)):
    items = rows(conn.execute(f"SELECT {_FIELDS} FROM admins ORDER BY id"))
    return {"items": items, "total": len(items)}


@router.post("", status_code=201)
def create_user(data: UserCreate, conn=Depends(get_db)):
    _check_username(conn, data.username)
    cur = conn.execute(
        "INSERT INTO admins (full_name, username, password_hash, role, position, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (data.full_name, data.username, hash_password(data.password), data.role, data.position, int(data.is_active), now()),
    )
    conn.commit()
    return _get(conn, cur.lastrowid)


@router.get("/{user_id}")
def get_user(user_id: int, conn=Depends(get_db)):
    return _get(conn, user_id)


@router.put("/{user_id}")
def replace_user(user_id: int, data: UserReplace, me=Depends(require_super_admin), conn=Depends(get_db)):
    ensure_exists(conn, "admins", user_id, "İstifadəçi")
    values = data.model_dump()
    if not values.get("password"):
        values.pop("password", None)
    _apply(conn, user_id, values, me)
    return _get(conn, user_id)


@router.patch("/{user_id}")
def patch_user(user_id: int, data: UserPatch, me=Depends(require_super_admin), conn=Depends(get_db)):
    ensure_exists(conn, "admins", user_id, "İstifadəçi")
    values = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None or k == "position"}
    _apply(conn, user_id, values, me)
    return _get(conn, user_id)


@router.delete("/{user_id}")
def delete_user(user_id: int, me=Depends(require_super_admin), conn=Depends(get_db)):
    ensure_exists(conn, "admins", user_id, "İstifadəçi")
    if user_id == me["id"]:
        raise HTTPException(status_code=409, detail="Öz hesabınızı silə bilməzsiniz.")
    _guard_last_super_admin(conn, user_id, None, None, deleting=True)
    conn.execute("DELETE FROM admins WHERE id = ?", (user_id,))
    conn.commit()
    return {"message": "İstifadəçi silindi."}
