from fastapi import APIRouter, Depends, HTTPException, Request

from database import get_db, now, rows
from models import ChangePasswordRequest, LoginRequest
from security import (
    create_access_token,
    get_current_admin,
    hash_password,
    login_limiter,
    verify_password,
)

router = APIRouter(tags=["Auth"])

# Mövcud olmayan istifadəçi üçün də hash yoxlaması aparılır ki,
# cavab müddətindən istifadəçi adının mövcudluğu bilinməsin.
_DUMMY_HASH = hash_password("intelia-timing-guard")


@router.post("/api/auth/login")
@router.post("/api/admin/login")
def login(data: LoginRequest, request: Request, conn=Depends(get_db)):
    username = data.username.strip().lower()
    client_ip = request.client.host if request.client else "unknown"
    key = f"{client_ip}:{username}"
    login_limiter.check(key)

    admin = conn.execute(
        "SELECT id, full_name, username, role, position, password_hash, is_active FROM admins WHERE username = ?",
        (username,),
    ).fetchone()

    valid = verify_password(data.password, admin["password_hash"] if admin else _DUMMY_HASH)
    if not admin or not valid or not admin["is_active"]:
        login_limiter.fail(key)
        raise HTTPException(status_code=401, detail="İstifadəçi adı və ya şifrə yanlışdır.")

    login_limiter.reset(key)
    conn.execute("UPDATE admins SET last_login_at = ? WHERE id = ?", (now(), admin["id"]))
    conn.commit()

    admin = dict(admin)
    token, expires_in = create_access_token(admin)
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": expires_in,
        "admin": {k: admin[k] for k in ("id", "full_name", "username", "role", "position")},
    }


@router.get("/api/auth/me")
def me(admin=Depends(get_current_admin)):
    return {"admin": admin}


@router.post("/api/auth/change-password")
def change_password(data: ChangePasswordRequest, admin=Depends(get_current_admin), conn=Depends(get_db)):
    current = conn.execute("SELECT password_hash FROM admins WHERE id = ?", (admin["id"],)).fetchone()
    if not verify_password(data.current_password, current["password_hash"]):
        raise HTTPException(status_code=400, detail="Cari şifrə yanlışdır.")
    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="Yeni şifrə cari şifrədən fərqli olmalıdır.")
    conn.execute("UPDATE admins SET password_hash = ? WHERE id = ?", (hash_password(data.new_password), admin["id"]))
    conn.commit()
    return {"message": "Şifrə uğurla dəyişdirildi."}


# Köhnə /users endpointlərinin yerinə: sistem istifadəçiləri = adminlər
@router.get("/api/admins")
@router.get("/api/users")
@router.get("/api/admin/users", include_in_schema=False)
def list_admins(_=Depends(get_current_admin), conn=Depends(get_db)):
    items = rows(conn.execute(
        "SELECT id, full_name, username, role, position, is_active, last_login_at, created_at FROM admins ORDER BY id"
    ))
    return {"items": items, "total": len(items)}
