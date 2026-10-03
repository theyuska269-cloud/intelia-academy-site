"""
SQLite bağlantısı, schema təsviri və avtomatik migrasiya.

Server hər açılanda:
  1. Mövcud database SİLİNMİR.
  2. Olmayan cədvəllər CREATE edilir.
  3. Mövcud cədvəldə çatışmayan sütunlar ALTER TABLE ilə əlavə olunur.
  4. Köhnə sütun adları (məs. admins.name -> full_name) yenidən adlandırılır.
  5. Yeni insert-ləri sındıra biləcək köhnə NOT NULL sütunlar varsa
     (məs. admins.password), cədvəl məlumatlar qorunaraq yenidən qurulur.
     Bundan əvvəl database-in ehtiyat nüsxəsi backend/backups-a yazılır.

Beləliklə "table admins has no column named name" kimi schema xətaları
bir daha yaranmır: kodun gözlədiyi schema ilə bazadakı schema hər
startda tutuşdurulur.
"""

import logging
import os
import re
import shutil
import sqlite3
from datetime import datetime

import config

log = logging.getLogger("intelia.db")


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------
# Hər sütun (ad, tərif). Tərif ALTER TABLE ADD COLUMN ilə əlavə oluna
# biləcək formada yazılıb (NOT NULL olanların DEFAULT-u var).

SCHEMA: dict[str, list[tuple[str, str]]] = {
    "admins": [
        ("id", "INTEGER PRIMARY KEY AUTOINCREMENT"),
        ("full_name", "TEXT NOT NULL DEFAULT ''"),
        ("username", "TEXT NOT NULL UNIQUE COLLATE NOCASE"),
        ("password_hash", "TEXT"),
        ("role", "TEXT NOT NULL DEFAULT 'Super Admin'"),
        ("position", "TEXT"),
        ("is_active", "INTEGER NOT NULL DEFAULT 1"),
        ("last_login_at", "TEXT"),
        ("created_at", "TEXT"),
    ],
    "courses": [
        ("id", "INTEGER PRIMARY KEY AUTOINCREMENT"),
        ("name", "TEXT NOT NULL DEFAULT ''"),
        ("description", "TEXT"),
        ("price", "REAL NOT NULL DEFAULT 0"),
        ("duration", "TEXT"),
        ("is_active", "INTEGER NOT NULL DEFAULT 1"),
        ("created_at", "TEXT"),
        ("updated_at", "TEXT"),
    ],
    "teachers": [
        ("id", "INTEGER PRIMARY KEY AUTOINCREMENT"),
        ("full_name", "TEXT NOT NULL DEFAULT ''"),
        ("phone", "TEXT"),
        ("subject", "TEXT"),
        ("course_id", "INTEGER REFERENCES courses(id) ON DELETE SET NULL"),
        ("status", "TEXT NOT NULL DEFAULT 'Aktiv'"),
        ("created_at", "TEXT"),
        ("updated_at", "TEXT"),
    ],
    "groups": [
        ("id", "INTEGER PRIMARY KEY AUTOINCREMENT"),
        ("name", "TEXT NOT NULL DEFAULT ''"),
        ("course_id", "INTEGER REFERENCES courses(id) ON DELETE RESTRICT"),
        ("teacher_id", "INTEGER REFERENCES teachers(id) ON DELETE SET NULL"),
        ("days", "TEXT NOT NULL DEFAULT ''"),
        ("start_time", "TEXT"),
        ("end_time", "TEXT"),
        ("start_date", "TEXT"),
        ("capacity", "INTEGER"),
        ("whatsapp_link", "TEXT"),
        ("telegram_link", "TEXT"),
        ("is_active", "INTEGER NOT NULL DEFAULT 1"),
        ("created_at", "TEXT"),
        ("updated_at", "TEXT"),
    ],
    "cards": [
        ("id", "INTEGER PRIMARY KEY AUTOINCREMENT"),
        ("bank_name", "TEXT NOT NULL DEFAULT ''"),
        ("card_number", "TEXT NOT NULL DEFAULT ''"),
        ("card_holder", "TEXT NOT NULL DEFAULT ''"),
        # Gələcək QR ödəniş üçün: QR şəklinin linki və ya ödəniş payload-u
        ("qr_code_url", "TEXT"),
        ("qr_payload", "TEXT"),
        ("sort_order", "INTEGER NOT NULL DEFAULT 0"),
        ("is_active", "INTEGER NOT NULL DEFAULT 1"),
        ("created_at", "TEXT"),
        ("updated_at", "TEXT"),
    ],
    "students": [
        ("id", "INTEGER PRIMARY KEY AUTOINCREMENT"),
        ("first_name", "TEXT NOT NULL DEFAULT ''"),
        ("last_name", "TEXT NOT NULL DEFAULT ''"),
        ("phone", "TEXT NOT NULL DEFAULT ''"),
        ("email", "TEXT"),
        ("education_level", "TEXT"),
        ("university", "TEXT"),
        ("specialty", "TEXT"),
        ("graduation_status", "TEXT"),
        ("course_id", "INTEGER REFERENCES courses(id) ON DELETE SET NULL"),
        ("group_id", "INTEGER REFERENCES groups(id) ON DELETE SET NULL"),
        ("status", "TEXT NOT NULL DEFAULT 'Yeni'"),
        ("source", "TEXT NOT NULL DEFAULT 'Online qeydiyyat'"),
        ("note", "TEXT"),
        ("created_at", "TEXT"),
        ("updated_at", "TEXT"),
    ],
    "payments": [
        ("id", "INTEGER PRIMARY KEY AUTOINCREMENT"),
        ("student_id", "INTEGER REFERENCES students(id) ON DELETE CASCADE"),
        ("course_id", "INTEGER REFERENCES courses(id) ON DELETE SET NULL"),
        ("card_id", "INTEGER REFERENCES cards(id) ON DELETE SET NULL"),
        ("card_label", "TEXT"),
        ("amount", "REAL NOT NULL DEFAULT 0"),
        ("receipt_path", "TEXT"),
        ("receipt_name", "TEXT"),
        ("status", "TEXT NOT NULL DEFAULT 'Gözləyir'"),
        ("admin_note", "TEXT"),
        ("paid_at", "TEXT"),
        ("reviewed_by", "INTEGER REFERENCES admins(id) ON DELETE SET NULL"),
        ("reviewed_at", "TEXT"),
        ("created_at", "TEXT"),
        ("updated_at", "TEXT"),
    ],
    "attendance": [
        ("id", "INTEGER PRIMARY KEY AUTOINCREMENT"),
        ("group_id", "INTEGER REFERENCES groups(id) ON DELETE CASCADE"),
        ("student_id", "INTEGER REFERENCES students(id) ON DELETE CASCADE"),
        ("lesson_date", "TEXT NOT NULL DEFAULT ''"),
        ("status", "TEXT NOT NULL DEFAULT 'İştirak etdi'"),
        ("note", "TEXT"),
        ("marked_by", "INTEGER REFERENCES admins(id) ON DELETE SET NULL"),
        ("created_at", "TEXT"),
        ("updated_at", "TEXT"),
    ],
    "expenses": [
        ("id", "INTEGER PRIMARY KEY AUTOINCREMENT"),
        ("title", "TEXT NOT NULL DEFAULT ''"),
        ("category", "TEXT NOT NULL DEFAULT 'Digər'"),
        ("amount", "REAL NOT NULL DEFAULT 0"),
        ("expense_date", "TEXT"),
        ("note", "TEXT"),
        ("created_by", "INTEGER REFERENCES admins(id) ON DELETE SET NULL"),
        ("created_at", "TEXT"),
        ("updated_at", "TEXT"),
    ],
    "settings": [
        ("key", "TEXT PRIMARY KEY"),
        ("value", "TEXT"),
    ],
}

# Köhnə versiyalardan qalan sütun adları: {cədvəl: {köhnə: yeni}}
RENAMES: dict[str, dict[str, str]] = {
    "admins": {"name": "full_name"},
    "students": {"education": "education_level"},
    "cards": {"active": "is_active"},
}

INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_students_phone ON students(phone)",
    "CREATE INDEX IF NOT EXISTS idx_students_status ON students(status)",
    "CREATE INDEX IF NOT EXISTS idx_students_course ON students(course_id)",
    "CREATE INDEX IF NOT EXISTS idx_students_group ON students(group_id)",
    "CREATE INDEX IF NOT EXISTS idx_groups_course ON groups(course_id)",
    "CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id)",
    "CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)",
    "CREATE INDEX IF NOT EXISTS idx_students_email ON students(email)",
    "CREATE UNIQUE INDEX IF NOT EXISTS ux_attendance ON attendance(group_id, student_id, lesson_date)",
    "CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(lesson_date)",
    "CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date)",
]

DEFAULT_SETTINGS = {
    "registration_open": "1",
    "contact_phone": "",
    "contact_whatsapp": "",
    "payment_note": "Ödənişi kartlardan birinə köçürdükdən sonra qəbzin şəklini və ya PDF faylını yükləyin.",
    "success_message": "Müraciətiniz qəbul edildi. Ödənişiniz yoxlanıldıqdan sonra sizinlə əlaqə saxlanılacaq.",
}


# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------

def now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DB_PATH, timeout=15, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    # SQLite-in lower() funksiyası yalnız ASCII ilə işləyir; Azərbaycan hərfləri üçün ayrıca funksiya
    conn.create_function("ilower", 1, fold_text, deterministic=True)
    return conn


def fold_text(value):
    """Axtarış üçün mətn normallaşdırması: İ/I/ı -> i, sonra kiçik hərf."""
    if not isinstance(value, str):
        return value
    return value.replace("İ", "i").replace("I", "i").replace("ı", "i").lower()


def get_db():
    """FastAPI dependency: hər sorğu üçün ayrıca bağlantı."""
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def rows(cursor_or_list) -> list[dict]:
    return [dict(r) for r in cursor_or_list]


def row(r) -> dict | None:
    return dict(r) if r is not None else None


# ---------------------------------------------------------------------------
# Migration
# ---------------------------------------------------------------------------

def _table_columns(conn, table: str) -> dict[str, dict]:
    return {
        r["name"]: dict(r)
        for r in conn.execute(f'PRAGMA table_info("{table}")').fetchall()
    }


def _create_sql(table: str, name: str | None = None) -> str:
    cols = ",\n    ".join(f'"{c}" {d}' for c, d in SCHEMA[table])
    return f'CREATE TABLE IF NOT EXISTS "{name or table}" (\n    {cols}\n)'


def _can_add_column(definition: str) -> bool:
    d = definition.upper()
    if "PRIMARY KEY" in d or "UNIQUE" in d:
        return False
    if "NOT NULL" in d and "DEFAULT" not in d:
        return False
    return True


def _fallback_value(definition: str) -> str:
    m = re.search(r"DEFAULT\s+('(?:[^']|'')*'|[-\w.]+)", definition, re.IGNORECASE)
    if m:
        return m.group(1)
    upper = definition.upper()
    return "0" if ("INTEGER" in upper or "REAL" in upper) else "''"


class _Backup:
    done = False

    @classmethod
    def ensure(cls):
        if cls.done or not config.DB_PATH.exists():
            return
        config.BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        target = config.BACKUP_DIR / f"intelia-{datetime.now():%Y%m%d-%H%M%S}.db"
        shutil.copy2(config.DB_PATH, target)
        log.warning("Schema dəyişikliyindən əvvəl ehtiyat nüsxə yaradıldı: %s", target)
        cls.done = True


def _rebuild_table(conn, table: str, existing: dict[str, dict]):
    """Cədvəli yeni schema ilə yenidən qurur, ortaq sütunlardakı məlumatları köçürür."""
    _Backup.ensure()
    tmp = f"{table}__new"
    conn.execute(f'DROP TABLE IF EXISTS "{tmp}"')
    conn.execute(_create_sql(table, tmp))

    defs = dict(SCHEMA[table])
    common = [c for c in defs if c in existing]
    select_parts = []
    for c in common:
        if "NOT NULL" in defs[c].upper() and "PRIMARY KEY" not in defs[c].upper():
            select_parts.append(f'COALESCE("{c}", {_fallback_value(defs[c])})')
        else:
            select_parts.append(f'"{c}"')

    if common:
        conn.execute(
            f'INSERT INTO "{tmp}" ({", ".join(chr(34) + c + chr(34) for c in common)}) '
            f'SELECT {", ".join(select_parts)} FROM "{table}"'
        )
    conn.execute(f'DROP TABLE "{table}"')
    conn.execute(f'ALTER TABLE "{tmp}" RENAME TO "{table}"')
    log.warning("Cədvəl yenidən quruldu: %s (köçürülən sütunlar: %s)", table, ", ".join(common))


def migrate(conn: sqlite3.Connection):
    conn.execute("PRAGMA foreign_keys = OFF")
    try:
        conn.execute("BEGIN")
        existing_tables = {
            r["name"]
            for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }

        for table, columns in SCHEMA.items():
            if table not in existing_tables:
                conn.execute(_create_sql(table))
                log.info("Cədvəl yaradıldı: %s", table)
                continue

            existing = _table_columns(conn, table)

            # 1) Köhnə adları yenilə
            for old, new in RENAMES.get(table, {}).items():
                if old in existing and new not in existing:
                    _Backup.ensure()
                    conn.execute(f'ALTER TABLE "{table}" RENAME COLUMN "{old}" TO "{new}"')
                    log.warning("Sütun adı dəyişdirildi: %s.%s -> %s", table, old, new)
            existing = _table_columns(conn, table)

            spec = dict(columns)
            missing = [c for c in spec if c not in existing]

            # 2) Yeni insert-ləri sındıracaq köhnə sütun və ya əlavə edilə bilməyən sütun varsa -> rebuild
            blocking_legacy = [
                c for c, info in existing.items()
                if c not in spec and info["notnull"] and info["dflt_value"] is None and not info["pk"]
            ]
            not_addable = [c for c in missing if not _can_add_column(spec[c])]
            legacy_extra = [c for c in existing if c not in spec]
            is_empty = conn.execute(f'SELECT 1 FROM "{table}" LIMIT 1').fetchone() is None

            # Boş cədvəldə köhnə sütunlar qalıbsa, təmiz schema ilə yenidən qur (məlumat itkisi riski yoxdur)
            if blocking_legacy or not_addable or (legacy_extra and is_empty):
                _rebuild_table(conn, table, existing)
                continue

            # 3) Çatışmayan sütunları əlavə et
            for c in missing:
                conn.execute(f'ALTER TABLE "{table}" ADD COLUMN "{c}" {spec[c]}')
                log.warning("Sütun əlavə edildi: %s.%s", table, c)

        for sql in INDEXES:
            conn.execute(sql)

        for key, value in DEFAULT_SETTINGS.items():
            conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, value))

        # Boş tarixləri doldur
        for table, columns in SCHEMA.items():
            if any(c == "created_at" for c, _ in columns):
                conn.execute(f'UPDATE "{table}" SET created_at = ? WHERE created_at IS NULL OR created_at = \'\'', (now(),))

        violations = conn.execute("PRAGMA foreign_key_check").fetchall()
        if violations:
            log.warning("Foreign key uyğunsuzluqları tapıldı: %s", [tuple(v) for v in violations][:10])

        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    finally:
        conn.execute("PRAGMA foreign_keys = ON")


def seed_admins(conn: sqlite3.Connection):
    from security import hash_password

    for admin in config.INITIAL_ADMINS:
        existing = conn.execute(
            "SELECT id, password_hash FROM admins WHERE username = ?", (admin["username"],)
        ).fetchone()
        password = os.getenv(admin["password_env"], "").strip()

        if existing is None:
            if not password:
                log.error(
                    "%s üçün şifrə .env faylında yoxdur (%s). Admin yaradılmadı.",
                    admin["username"], admin["password_env"],
                )
                continue
            conn.execute(
                "INSERT INTO admins (full_name, username, password_hash, role, position, is_active, created_at) "
                "VALUES (?, ?, ?, ?, ?, 1, ?)",
                (admin["full_name"], admin["username"], hash_password(password), admin["role"], admin["position"], now()),
            )
            log.info("Admin yaradıldı: %s", admin["username"])
        else:
            if not existing["password_hash"]:
                if not password:
                    log.error("%s üçün şifrə .env-də yoxdur (%s).", admin["username"], admin["password_env"])
                    continue
                conn.execute(
                    "UPDATE admins SET password_hash = ? WHERE id = ?",
                    (hash_password(password), existing["id"]),
                )
                log.info("Admin şifrəsi hash edildi: %s", admin["username"])
            conn.execute(
                "UPDATE admins SET full_name = CASE WHEN full_name = '' OR full_name IS NULL THEN ? ELSE full_name END, "
                "role = ?, position = COALESCE(NULLIF(position, ''), ?) WHERE id = ?",
                (admin["full_name"], admin["role"], admin["position"], existing["id"]),
            )
    conn.commit()


def init_db():
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    config.RECEIPT_DIR.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(config.DB_PATH, timeout=15, isolation_level=None)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        migrate(conn)
    finally:
        conn.close()

    conn = connect()
    try:
        seed_admins(conn)
    finally:
        conn.close()
