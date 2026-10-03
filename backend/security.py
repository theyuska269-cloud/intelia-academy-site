"""
Şifrə hashing (Argon2), JWT token və admin yoxlaması.
"""

import threading
import time
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash

import config
from database import get_db

_password_hash = PasswordHash.recommended()  # Argon2id
_bearer = HTTPBearer(auto_error=False)

ADMIN_ROLES = {"Super Admin", "Admin"}


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return _password_hash.verify(password, password_hash)
    except Exception:
        return False


def create_access_token(admin: dict) -> tuple[str, int]:
    expires_in = config.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(admin["id"]),
        "username": admin["username"],
        "role": admin["role"],
        "type": "access",
        "iat": now,
        "exp": now + timedelta(seconds=expires_in),
    }
    token = jwt.encode(payload, config.SECRET_KEY, algorithm=config.JWT_ALGORITHM)
    return token, expires_in


def _unauthorized(detail: str = "Sessiya etibarsızdır. Yenidən daxil olun."):
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    conn=Depends(get_db),
) -> dict:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized("Bu əməliyyat üçün admin girişi tələb olunur.")
    try:
        payload = jwt.decode(
            credentials.credentials,
            config.SECRET_KEY,
            algorithms=[config.JWT_ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Sessiyanın müddəti bitib. Yenidən daxil olun.")
    except jwt.PyJWTError:
        raise _unauthorized()

    if payload.get("type") != "access":
        raise _unauthorized()

    admin = conn.execute(
        "SELECT id, full_name, username, role, position, is_active FROM admins WHERE id = ?",
        (payload.get("sub"),),
    ).fetchone()
    if admin is None or not admin["is_active"]:
        raise _unauthorized()
    if admin["role"] not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Bu bölməyə giriş icazəniz yoxdur.")
    return dict(admin)


def require_super_admin(admin: dict = Depends(get_current_admin)) -> dict:
    if admin["role"] != "Super Admin":
        raise HTTPException(status_code=403, detail="Bu əməliyyat yalnız Super Admin üçündür.")
    return admin


# ---------------------------------------------------------------------------
# Login brute-force qoruması (yaddaşda, IP + username üzrə)
# ---------------------------------------------------------------------------

class LoginRateLimiter:
    def __init__(self, max_attempts: int = 5, window_seconds: int = 15 * 60):
        self.max_attempts = max_attempts
        self.window = window_seconds
        self._attempts: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def _recent(self, key: str) -> list[float]:
        cutoff = time.time() - self.window
        attempts = [t for t in self._attempts.get(key, []) if t > cutoff]
        self._attempts[key] = attempts
        return attempts

    def check(self, key: str):
        with self._lock:
            attempts = self._recent(key)
            if len(attempts) >= self.max_attempts:
                wait = int(attempts[0] + self.window - time.time()) // 60 + 1
                raise HTTPException(
                    status_code=429,
                    detail=f"Çox sayda uğursuz cəhd. {wait} dəqiqə sonra yenidən yoxlayın.",
                )

    def fail(self, key: str):
        with self._lock:
            self._recent(key).append(time.time())

    def reset(self, key: str):
        with self._lock:
            self._attempts.pop(key, None)


login_limiter = LoginRateLimiter()
