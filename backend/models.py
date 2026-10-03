"""
Pydantic sxemləri, status sabitləri və validasiya köməkçiləri.
"""

import re
from typing import Optional

from pydantic import BaseModel, Field, field_validator

STUDENT_STATUSES = ["Yeni", "Əlaqə saxlanılıb", "Qeydiyyat tamamlandı", "Aktiv", "Deaktiv"]
PAYMENT_STATUSES = ["Gözləyir", "Təsdiqləndi", "Rədd edildi"]
TEACHER_STATUSES = ["Aktiv", "Deaktiv"]
EDUCATION_LEVELS = [
    "Orta təhsil",
    "Peşə təhsili",
    "Bakalavr",
    "Magistr",
    "Doktorantura",
    "Digər",
]
GRADUATION_STATUSES = ["Bitirib", "Oxuyur"]
ATTENDANCE_STATUSES = ["İştirak etdi", "Gecikdi", "Qayıb", "Üzrlü"]
EXPENSE_CATEGORIES = ["İcarə", "Maaş", "Kommunal", "Marketinq", "Avadanlıq", "Ofis xərcləri", "Vergi", "Digər"]
WEEK_DAYS = {
    1: "Bazar ertəsi",
    2: "Çərşənbə axşamı",
    3: "Çərşənbə",
    4: "Cümə axşamı",
    5: "Cümə",
    6: "Şənbə",
    7: "Bazar",
}

_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


# ---------------------------------------------------------------------------
# Köməkçilər
# ---------------------------------------------------------------------------

def clean_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = re.sub(r"\s+", " ", str(value)).strip()
    return value or None


def normalize_phone(value: str) -> str:
    """Azərbaycan nömrələrini +994XXXXXXXXX formatına salır, digərlərini + ilə saxlayır."""
    raw = str(value or "").strip()
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("00"):
        digits = digits[2:]
    if len(digits) == 10 and digits.startswith("0"):
        digits = "994" + digits[1:]
    elif len(digits) == 9:
        digits = "994" + digits
    if digits.startswith("994"):
        if len(digits) != 12:
            raise ValueError("Telefon nömrəsi düzgün deyil. Nümunə: +994 50 123 45 67")
        if digits[3:5] not in {"10", "12", "50", "51", "55", "60", "70", "77", "99"}:
            raise ValueError("Mobil operator kodu düzgün deyil (50, 51, 55, 70, 77, 99, 10, 60).")
    elif not 10 <= len(digits) <= 15:
        raise ValueError("Telefon nömrəsi düzgün deyil. Nümunə: +994 50 123 45 67")
    return "+" + digits


_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}$")


def normalize_email(value: Optional[str]) -> Optional[str]:
    value = (value or "").strip().lower()
    if not value:
        return None
    if len(value) > 120 or not _EMAIL_RE.match(value) or ".." in value:
        raise ValueError("E-poçt ünvanı düzgün deyil. Nümunə: ad@gmail.com")
    return value


def validate_graduation(value: Optional[str]) -> Optional[str]:
    value = clean_text(value)
    if value and value not in GRADUATION_STATUSES:
        raise ValueError("Təhsil vəziyyəti düzgün deyil (Bitirib / Oxuyur).")
    return value


def validate_url(value: Optional[str]) -> Optional[str]:
    value = clean_text(value)
    if not value:
        return None
    if not re.match(r"^https?://[^\s<>\"']+$", value, re.IGNORECASE):
        raise ValueError("Link http:// və ya https:// ilə başlamalıdır.")
    return value


def normalize_card_number(value: str) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    if not 13 <= len(digits) <= 19:
        raise ValueError("Kart nömrəsi 16 rəqəmdən ibarət olmalıdır.")
    return digits


def validate_link(value: Optional[str], kind: str) -> Optional[str]:
    value = clean_text(value)
    if not value:
        return None
    if not re.match(r"^https?://", value, re.IGNORECASE):
        value = "https://" + value
    allowed = {
        "whatsapp": ("chat.whatsapp.com", "wa.me", "whatsapp.com"),
        "telegram": ("t.me", "telegram.me", "telegram.org"),
    }[kind]
    host = re.sub(r"^https?://", "", value, flags=re.IGNORECASE).split("/")[0].lower()
    if not any(host == d or host.endswith("." + d) for d in allowed):
        name = "WhatsApp" if kind == "whatsapp" else "Telegram"
        raise ValueError(f"{name} linki düzgün deyil.")
    return value


def parse_days(value) -> str:
    if value is None or value == "":
        return ""
    if isinstance(value, str):
        items = [v for v in re.split(r"[,\s]+", value) if v]
    else:
        items = list(value)
    days = sorted({int(v) for v in items})
    if any(d not in WEEK_DAYS for d in days):
        raise ValueError("Dərs günləri 1-7 aralığında olmalıdır.")
    return ",".join(str(d) for d in days)


def _name(value: str, label: str) -> str:
    value = clean_text(value) or ""
    if len(value) < 2:
        raise ValueError(f"{label} ən azı 2 simvol olmalıdır.")
    if len(value) > 60:
        raise ValueError(f"{label} çox uzundur.")
    if not re.match(r"^[^\d<>{}\[\]@#$%^*=+|\\/]+$", value):
        raise ValueError(f"{label} yalnız hərflərdən ibarət olmalıdır.")
    return value


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=200)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=200)

    @field_validator("new_password")
    @classmethod
    def strong(cls, v):
        if not (re.search(r"[A-Za-z]", v) and re.search(r"\d", v)):
            raise ValueError("Yeni şifrədə ən azı bir hərf və bir rəqəm olmalıdır.")
        return v


# ---------------------------------------------------------------------------
# Users (sistem istifadəçiləri = adminlər)
# ---------------------------------------------------------------------------

USER_ROLES = ["Super Admin", "Admin"]
_USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,32}$")


def _username(v: str) -> str:
    v = (v or "").strip().lower()
    if not _USERNAME_RE.match(v):
        raise ValueError("İstifadəçi adı 3-32 simvol olmalıdır (kiçik latın hərfləri, rəqəm, . _ -).")
    return v


def _password(v: str) -> str:
    if len(v) < 8 or not (re.search(r"[A-Za-z]", v) and re.search(r"\d", v)):
        raise ValueError("Şifrə ən azı 8 simvol olmalı, hərf və rəqəm içərməlidir.")
    return v


def _role(v: str) -> str:
    if v not in USER_ROLES:
        raise ValueError("Rol düzgün deyil (Super Admin / Admin).")
    return v


class UserCreate(BaseModel):
    full_name: str = Field(..., max_length=120)
    username: str
    password: str = Field(..., max_length=200)
    role: str = "Admin"
    position: Optional[str] = Field(None, max_length=80)
    is_active: bool = True

    _v_name = field_validator("full_name")(lambda cls, v: _name(v, "Ad Soyad"))
    _v_user = field_validator("username")(lambda cls, v: _username(v))
    _v_pass = field_validator("password")(lambda cls, v: _password(v))
    _v_role = field_validator("role")(lambda cls, v: _role(v))
    _v_pos = field_validator("position")(lambda cls, v: clean_text(v))


class UserReplace(BaseModel):
    """PUT: əsas sahələr tam göndərilir, şifrə istəyə görə."""
    full_name: str = Field(..., max_length=120)
    username: str
    role: str
    position: Optional[str] = Field(None, max_length=80)
    is_active: bool = True
    password: Optional[str] = Field(None, max_length=200)

    _v_name = field_validator("full_name")(lambda cls, v: _name(v, "Ad Soyad"))
    _v_user = field_validator("username")(lambda cls, v: _username(v))
    _v_pass = field_validator("password")(lambda cls, v: _password(v) if v else None)
    _v_role = field_validator("role")(lambda cls, v: _role(v))
    _v_pos = field_validator("position")(lambda cls, v: clean_text(v))


class UserPatch(BaseModel):
    full_name: Optional[str] = Field(None, max_length=120)
    username: Optional[str] = None
    role: Optional[str] = None
    position: Optional[str] = Field(None, max_length=80)
    is_active: Optional[bool] = None
    password: Optional[str] = Field(None, max_length=200)

    _v_name = field_validator("full_name")(lambda cls, v: None if v is None else _name(v, "Ad Soyad"))
    _v_user = field_validator("username")(lambda cls, v: None if v is None else _username(v))
    _v_pass = field_validator("password")(lambda cls, v: _password(v) if v else None)
    _v_role = field_validator("role")(lambda cls, v: None if v is None else _role(v))
    _v_pos = field_validator("position")(lambda cls, v: clean_text(v))


# ---------------------------------------------------------------------------
# Courses
# ---------------------------------------------------------------------------

class CourseIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    description: Optional[str] = Field(None, max_length=2000)
    price: float = Field(..., ge=0, le=100000)
    duration: Optional[str] = Field(None, max_length=60)
    is_active: bool = True

    _clean = field_validator("name", "description", "duration")(lambda cls, v: clean_text(v))


class CourseUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    description: Optional[str] = Field(None, max_length=2000)
    price: Optional[float] = Field(None, ge=0, le=100000)
    duration: Optional[str] = Field(None, max_length=60)
    is_active: Optional[bool] = None

    _clean = field_validator("name", "description", "duration")(lambda cls, v: clean_text(v))


# ---------------------------------------------------------------------------
# Teachers
# ---------------------------------------------------------------------------

class TeacherIn(BaseModel):
    full_name: str = Field(..., max_length=120)
    phone: Optional[str] = None
    subject: Optional[str] = Field(None, max_length=120)
    course_id: Optional[int] = None
    status: str = "Aktiv"

    @field_validator("full_name")
    @classmethod
    def v_name(cls, v):
        return _name(v, "Ad Soyad")

    @field_validator("phone")
    @classmethod
    def v_phone(cls, v):
        return normalize_phone(v) if clean_text(v) else None

    @field_validator("subject")
    @classmethod
    def v_subject(cls, v):
        return clean_text(v)

    @field_validator("status")
    @classmethod
    def v_status(cls, v):
        if v not in TEACHER_STATUSES:
            raise ValueError("Status düzgün deyil.")
        return v


class TeacherUpdate(TeacherIn):
    full_name: Optional[str] = Field(None, max_length=120)
    status: Optional[str] = None

    @field_validator("full_name")
    @classmethod
    def v_name(cls, v):
        return _name(v, "Ad Soyad") if v is not None else None

    @field_validator("status")
    @classmethod
    def v_status(cls, v):
        if v is not None and v not in TEACHER_STATUSES:
            raise ValueError("Status düzgün deyil.")
        return v


# ---------------------------------------------------------------------------
# Groups
# ---------------------------------------------------------------------------

class GroupIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    course_id: int
    teacher_id: Optional[int] = None
    days: list[int] | str = Field(default_factory=list)
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    start_date: Optional[str] = None
    capacity: Optional[int] = Field(None, ge=1, le=1000)
    whatsapp_link: Optional[str] = None
    telegram_link: Optional[str] = None
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def v_name(cls, v):
        v = clean_text(v)
        if not v:
            raise ValueError("Qrup adı boş ola bilməz.")
        return v

    @field_validator("days", mode="before")
    @classmethod
    def v_days(cls, v):
        return parse_days(v)

    @field_validator("start_time", "end_time")
    @classmethod
    def v_time(cls, v):
        v = clean_text(v)
        if v and not _TIME_RE.match(v):
            raise ValueError("Saat SS:DD formatında olmalıdır (məs. 19:00).")
        return v

    @field_validator("start_date")
    @classmethod
    def v_date(cls, v):
        v = clean_text(v)
        if v and not _DATE_RE.match(v):
            raise ValueError("Tarix YYYY-AA-GG formatında olmalıdır.")
        return v

    @field_validator("whatsapp_link")
    @classmethod
    def v_wa(cls, v):
        return validate_link(v, "whatsapp")

    @field_validator("telegram_link")
    @classmethod
    def v_tg(cls, v):
        return validate_link(v, "telegram")


class GroupUpdate(GroupIn):
    name: Optional[str] = Field(None, max_length=80)
    course_id: Optional[int] = None
    days: Optional[list[int] | str] = None
    is_active: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def v_name(cls, v):
        if v is None:
            return None
        v = clean_text(v)
        if not v:
            raise ValueError("Qrup adı boş ola bilməz.")
        return v

    @field_validator("days", mode="before")
    @classmethod
    def v_days(cls, v):
        return None if v is None else parse_days(v)


# ---------------------------------------------------------------------------
# Cards
# ---------------------------------------------------------------------------

class CardIn(BaseModel):
    bank_name: str = Field(..., min_length=2, max_length=80)
    card_number: str
    card_holder: str = Field(..., min_length=2, max_length=120)
    qr_code_url: Optional[str] = Field(None, max_length=500)
    qr_payload: Optional[str] = Field(None, max_length=1000)
    sort_order: int = Field(0, ge=0, le=1000)
    is_active: bool = True

    @field_validator("bank_name", "card_holder", "qr_payload")
    @classmethod
    def v_text(cls, v):
        return clean_text(v)

    @field_validator("qr_code_url")
    @classmethod
    def v_qr(cls, v):
        return validate_url(v)

    @field_validator("card_number")
    @classmethod
    def v_number(cls, v):
        return normalize_card_number(v)


class CardUpdate(BaseModel):
    bank_name: Optional[str] = Field(None, min_length=2, max_length=80)
    card_number: Optional[str] = None
    card_holder: Optional[str] = Field(None, min_length=2, max_length=120)
    qr_code_url: Optional[str] = Field(None, max_length=500)
    qr_payload: Optional[str] = Field(None, max_length=1000)
    sort_order: Optional[int] = Field(None, ge=0, le=1000)
    is_active: Optional[bool] = None

    @field_validator("bank_name", "card_holder", "qr_payload")
    @classmethod
    def v_text(cls, v):
        return clean_text(v)

    @field_validator("qr_code_url")
    @classmethod
    def v_qr(cls, v):
        return validate_url(v)

    @field_validator("card_number")
    @classmethod
    def v_number(cls, v):
        return normalize_card_number(v) if v is not None else None


# ---------------------------------------------------------------------------
# Students
# ---------------------------------------------------------------------------

class StudentIn(BaseModel):
    first_name: str
    last_name: str
    phone: str
    email: Optional[str] = None
    education_level: Optional[str] = Field(None, max_length=80)
    university: Optional[str] = Field(None, max_length=160)
    specialty: Optional[str] = Field(None, max_length=160)
    graduation_status: Optional[str] = None
    course_id: Optional[int] = None
    group_id: Optional[int] = None
    status: str = "Yeni"
    note: Optional[str] = Field(None, max_length=2000)

    @field_validator("first_name")
    @classmethod
    def v_first(cls, v):
        return _name(v, "Ad")

    @field_validator("last_name")
    @classmethod
    def v_last(cls, v):
        return _name(v, "Soyad")

    @field_validator("phone")
    @classmethod
    def v_phone(cls, v):
        return normalize_phone(v)

    @field_validator("email")
    @classmethod
    def v_email(cls, v):
        return normalize_email(v)

    @field_validator("graduation_status")
    @classmethod
    def v_grad(cls, v):
        return validate_graduation(v)

    @field_validator("education_level", "university", "specialty", "note")
    @classmethod
    def v_text(cls, v):
        return clean_text(v)

    @field_validator("status")
    @classmethod
    def v_status(cls, v):
        if v not in STUDENT_STATUSES:
            raise ValueError("Tələbə statusu düzgün deyil.")
        return v


class StudentUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    education_level: Optional[str] = Field(None, max_length=80)
    university: Optional[str] = Field(None, max_length=160)
    specialty: Optional[str] = Field(None, max_length=160)
    graduation_status: Optional[str] = None
    course_id: Optional[int] = None
    group_id: Optional[int] = None
    status: Optional[str] = None
    note: Optional[str] = Field(None, max_length=2000)

    @field_validator("first_name")
    @classmethod
    def v_first(cls, v):
        return _name(v, "Ad") if v is not None else None

    @field_validator("last_name")
    @classmethod
    def v_last(cls, v):
        return _name(v, "Soyad") if v is not None else None

    @field_validator("phone")
    @classmethod
    def v_phone(cls, v):
        return normalize_phone(v) if v is not None else None

    @field_validator("email")
    @classmethod
    def v_email(cls, v):
        return normalize_email(v)

    @field_validator("graduation_status")
    @classmethod
    def v_grad(cls, v):
        return validate_graduation(v)

    @field_validator("education_level", "university", "specialty", "note")
    @classmethod
    def v_text(cls, v):
        return clean_text(v)

    @field_validator("status")
    @classmethod
    def v_status(cls, v):
        if v is not None and v not in STUDENT_STATUSES:
            raise ValueError("Tələbə statusu düzgün deyil.")
        return v


# ---------------------------------------------------------------------------
# Payments
# ---------------------------------------------------------------------------

class PaymentUpdate(BaseModel):
    status: Optional[str] = None
    amount: Optional[float] = Field(None, ge=0, le=100000)
    admin_note: Optional[str] = Field(None, max_length=1000)
    card_id: Optional[int] = None

    @field_validator("status")
    @classmethod
    def v_status(cls, v):
        if v is not None and v not in PAYMENT_STATUSES:
            raise ValueError("Ödəniş statusu düzgün deyil.")
        return v

    @field_validator("admin_note")
    @classmethod
    def v_note(cls, v):
        return clean_text(v)


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------

class AttendanceMark(BaseModel):
    student_id: int
    status: str
    note: Optional[str] = Field(None, max_length=300)

    @field_validator("status")
    @classmethod
    def v_status(cls, v):
        if v not in ATTENDANCE_STATUSES:
            raise ValueError("Davamiyyət statusu düzgün deyil.")
        return v

    @field_validator("note")
    @classmethod
    def v_note(cls, v):
        return clean_text(v)


class AttendanceSave(BaseModel):
    group_id: int
    lesson_date: str
    records: list[AttendanceMark]

    @field_validator("lesson_date")
    @classmethod
    def v_date(cls, v):
        if not _DATE_RE.match(v or ""):
            raise ValueError("Tarix YYYY-AA-GG formatında olmalıdır.")
        return v


# ---------------------------------------------------------------------------
# Expenses
# ---------------------------------------------------------------------------

class ExpenseIn(BaseModel):
    title: str = Field(..., min_length=2, max_length=120)
    category: str = "Digər"
    amount: float = Field(..., gt=0, le=1000000)
    expense_date: str
    note: Optional[str] = Field(None, max_length=1000)

    @field_validator("title", "note")
    @classmethod
    def v_text(cls, v):
        return clean_text(v)

    @field_validator("category")
    @classmethod
    def v_cat(cls, v):
        if v not in EXPENSE_CATEGORIES:
            raise ValueError("Xərc kateqoriyası düzgün deyil.")
        return v

    @field_validator("expense_date")
    @classmethod
    def v_date(cls, v):
        if not _DATE_RE.match(v or ""):
            raise ValueError("Tarix YYYY-AA-GG formatında olmalıdır.")
        return v


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

class SettingsUpdate(BaseModel):
    registration_open: Optional[bool] = None
    contact_phone: Optional[str] = Field(None, max_length=40)
    contact_whatsapp: Optional[str] = Field(None, max_length=200)
    payment_note: Optional[str] = Field(None, max_length=1000)
    success_message: Optional[str] = Field(None, max_length=1000)
