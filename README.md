# Intelia Academy

Kurs qeydiyyatı + admin idarəetmə sistemi (FastAPI + SQLite + HTML/CSS/JS).

## İşə salmaq (Windows, VS Code terminal)

```powershell
cd C:\Users\aliye\Downloads\intelia-academy-final
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn backend.main:app --reload --port 8000
```

| Səhifə | Ünvan |
|---|---|
| Tələbə qeydiyyatı (müştəriyə göndərilən link) | http://127.0.0.1:8000/register |
| Admin panel | http://127.0.0.1:8000/admin |
| Qeydiyyat API | `POST /api/register` · Admin login: `POST /api/admin/login` |
| API sənədləri | http://127.0.0.1:8000/docs |

Frontend backend tərəfindən servis olunur, ona görə Live Server lazım deyil
(Live Server ilə açılsa da API avtomatik `127.0.0.1:8000`-ə qoşulur).

## Adminlər

| Ad | İstifadəçi adı | Rol |
|---|---|---|
| Rahib Məmmədov | `rahib` | Kurs rəhbəri / Super Admin |
| Yusif Əlizadə | `yusif` | Super Admin |

İlkin şifrələr `backend/.env` faylındakı `RAHIB_PASSWORD` / `YUSIF_PASSWORD` dəyərləridir.
Şifrələr bazada Argon2 hash kimi saxlanılır. İlk girişdən sonra şifrəni
**Ayarlar → Şifrəni dəyiş** bölməsindən dəyişin.

## Struktur

```
backend/
  main.py        FastAPI tətbiqi, routerlər, frontend servis
  config.py      .env oxunması, path-lər
  database.py    SQLite bağlantısı, schema və avtomatik migrasiya
  security.py    Argon2 hashing, JWT, admin yoxlaması, login limiti
  models.py      Pydantic sxemləri və validasiya
  uploads.py     Qəbz yükləmə (növ yoxlaması, təhlükəsiz ad)
  routers/       auth, public (qeydiyyat), dashboard (+hesabatlar), students, courses,
                 groups, teachers, cards, payments, attendance, expenses, settings,
                 users (/users CRUD — adminlərin idarəsi, yalnız Super Admin)
  .env           SECRET_KEY və ilkin şifrələr (paylaşmayın)
  uploads/       Ödəniş qəbzləri (avtomatik yaranır)
  backups/       Schema dəyişikliyindən əvvəl avtomatik ehtiyat nüsxələr
index.html, script.js, style.css         admin panel
register.html, register.js, register.css qeydiyyat səhifəsi
common.js, common.css                    ortaq hissələr
```

## Database

- Server açılanda baza **silinmir**. Olmayan cədvəllər yaradılır, çatışmayan sütunlar
  əlavə olunur, köhnə sütun adları yenilənir.
- Struktur dəyişikliyi lazım olarsa əvvəlcə `backend/backups/` qovluğuna ehtiyat nüsxə yazılır.
- Kök qovluqdakı `intelia.db` köhnə versiyadan qalıb və istifadə olunmur; real baza `backend/intelia.db`-dir.

## Production (Render) — https://inteliaacademy.com

- Repository: `theyuska269-cloud/intelia-academy-site`, branch **`production`**
- Deploy: `render.yaml` (Render Blueprint)
- Start: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- Baza, qəbzlər və ehtiyat nüsxələr davamlı diskdə: `/var/data` (ödənişli plan tələb edir)
- Gizli dəyərlər (`SECRET_KEY`, `RAHIB_PASSWORD`, `YUSIF_PASSWORD`) yalnız Render
  Environment bölməsində saxlanılır; `.env` və `*.db` GitHub-a göndərilmir.
- Köhnə statik sayt (GitHub Pages) faylları `legacy-site/` qovluğunda saxlanılıb.

| Səhifə | Ünvan |
|---|---|
| Ana səhifə (→ qeydiyyat) | https://inteliaacademy.com |
| Qeydiyyat | https://inteliaacademy.com/register |
| Admin panel | https://inteliaacademy.com/admin |
| API sənədləri | https://inteliaacademy.com/docs |

## /users API

`GET/POST /users`, `GET/PUT/PATCH/DELETE /users/{id}` — admin istifadəçilərinin idarəsi.
Super Admin tokeni tələb olunur (/docs-da **Authorize** düyməsi, token `POST /api/admin/login`-dən alınır).
Admin paneldə: **Ayarlar → Adminlər**.
