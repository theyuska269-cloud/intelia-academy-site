/* Intelia Academy — admin panel (SPA) */

const App = {
  admin: null,
  meta: null,
  lookups: { courses: [], groups: [], cards: [], teachers: [] },
  lookupsLoaded: false,
  renderId: 0,
};

const STUDENT_STATUS_BADGE = {
  "Yeni": "badge-cyan",
  "Əlaqə saxlanılıb": "badge-violet",
  "Qeydiyyat tamamlandı": "badge-blue",
  "Aktiv": "badge-green",
  "Deaktiv": "badge-gray",
};
const PAYMENT_BADGE = { "Gözləyir": "badge-amber", "Təsdiqləndi": "badge-green", "Rədd edildi": "badge-red" };
const STUDENT_STATUSES = Object.keys(STUDENT_STATUS_BADGE);
const PAYMENT_STATUSES = Object.keys(PAYMENT_BADGE);
const WEEK_DAYS = { 1: "Bazar ertəsi", 2: "Çərşənbə axşamı", 3: "Çərşənbə", 4: "Cümə axşamı", 5: "Cümə", 6: "Şənbə", 7: "Bazar" };
const WEEK_SHORT = { 1: "B.e", 2: "Ç.a", 3: "Ç", 4: "C.a", 5: "C", 6: "Ş", 7: "B" };

const PAGES = {
  dashboard: { title: "Dashboard", sub: "Ümumi vəziyyət və son fəaliyyətlər", icon: "dashboard", render: renderDashboard },
  students: { title: "Tələbələr", sub: "Bütün tələbələrin siyahısı və idarəetməsi", icon: "students", render: (c, id) => renderStudentList(c, "students", id) },
  applications: { title: "Müraciətlər", sub: "Onlayn qeydiyyatdan gələn yeni müraciətlər", icon: "inbox", render: (c, id) => renderStudentList(c, "applications", id), count: "applications" },
  teachers: { title: "Müəllimlər", sub: "Müəllim heyəti və qrupları", icon: "teacher", render: renderTeachers },
  courses: { title: "Kurslar", sub: "Kurslar, qiymətlər və müddət", icon: "book", render: renderCourses },
  groups: { title: "Qruplar", sub: "Qruplar, dərs cədvəli və tələbələr", icon: "groups", render: renderGroups },
  payments: { title: "Ödənişlər", sub: "Qəbzlərin yoxlanması və ödəniş tarixçəsi", icon: "wallet", render: renderPayments, count: "payments" },
  attendance: { title: "Davamiyyət", sub: "Qruplar üzrə dərs iştirakının qeydiyyatı", icon: "clipboard", render: renderAttendance },
  expenses: { title: "Xərclər", sub: "Akademiyanın xərcləri və kateqoriyalar", icon: "receipt", render: renderExpenses },
  cards: { title: "Kartlar", sub: "Qeydiyyat səhifəsində göstərilən ödəniş kartları", icon: "card", render: renderCards },
  reports: { title: "Hesabatlar", sub: "Gəlir, xərc, qeydiyyat və doluluq göstəriciləri", icon: "chart", render: renderReports },
  settings: { title: "Ayarlar", sub: "Qeydiyyat səhifəsi, təhlükəsizlik və adminlər", icon: "settings", render: renderSettings },
};

const NAV_GROUPS = [
  { label: "Əsas", items: ["dashboard"] },
  { label: "Tədris", items: ["students", "groups", "teachers", "courses", "applications", "attendance"] },
  { label: "Maliyyə", items: ["payments", "expenses", "reports", "cards"] },
  { label: "Sistem", items: ["settings"] },
];
const ATTENDANCE_STATUSES = ["İştirak etdi", "Gecikdi", "Qayıb", "Üzrlü"];
const EXPENSE_CATEGORIES = ["İcarə", "Maaş", "Kommunal", "Marketinq", "Avadanlıq", "Ofis xərcləri", "Vergi", "Digər"];
const EDUCATION_LEVELS = ["Orta təhsil", "Peşə təhsili", "Bakalavr", "Magistr", "Doktorantura", "Digər"];

function adminRoleLabel(a) {
  return a.position && a.position !== a.role ? `${a.position} · ${a.role}` : a.role;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* =====================================================================
   AUTH
   ===================================================================== */

function showLogin(message) {
  $("#app").classList.add("hidden");
  $("#loginPage").classList.remove("hidden");
  $("#loginError").innerHTML = message ? `<div class="alert alert-warning">${icon("info")}<span>${esc(message)}</span></div>` : "";
  setTimeout(() => $("#username").focus(), 50);
}

async function handleLogin(e) {
  e.preventDefault();
  const username = $("#username").value.trim();
  const password = $("#password").value;
  const errBox = $("#loginError");
  if (!username || !password) {
    errBox.innerHTML = `<div class="alert alert-error">${icon("alert")}<span>İstifadəçi adı və şifrəni daxil edin.</span></div>`;
    return;
  }
  const btn = $("#loginBtn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Yoxlanılır…`;
  try {
    const res = await api("/api/auth/login", { method: "POST", body: { username, password }, auth: false });
    storage.set(TOKEN_KEY, res.access_token);
    $("#password").value = "";
    errBox.innerHTML = "";
    App.admin = res.admin;
    await startApp();
  } catch (err) {
    errBox.innerHTML = `<div class="alert alert-error">${icon("alert")}<span>${esc(err.message)}</span></div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Daxil ol";
  }
}

async function logout() {
  if (!(await confirmDialog({ title: "Çıxış", message: "Admin paneldən çıxmaq istəyirsiniz?", confirmText: "Çıxış et" }))) return;
  storage.remove(TOKEN_KEY);
  App.admin = null;
  App.lookupsLoaded = false;
  closeAllModals();
  history.replaceState(null, "", location.pathname);
  showLogin();
}

window.addEventListener("intelia:unauthorized", () => {
  if (!App.admin) return;
  storage.remove(TOKEN_KEY);
  App.admin = null;
  closeAllModals();
  showLogin("Sessiyanın müddəti bitib. Zəhmət olmasa yenidən daxil olun.");
});

async function startApp() {
  $("#loginPage").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#adminName").textContent = App.admin.full_name;
  $("#adminRole").textContent = adminRoleLabel(App.admin);
  $("#adminAvatar").textContent = initials(App.admin.full_name);
  buildNav();
  if (!location.hash) location.hash = "#/dashboard";
  else route();
  refreshCounts();
}

/* =====================================================================
   NAVIGATION
   ===================================================================== */

function buildNav() {
  $("#nav").innerHTML = NAV_GROUPS.map((g) => `
    <div class="nav-label">${g.label}</div>
    ${g.items.map((key) => `
      <a class="nav-item" href="#/${key}" data-page="${key}">
        ${icon(PAGES[key].icon)}<span>${PAGES[key].title}</span>
        ${PAGES[key].count ? `<span class="count hidden" data-count="${PAGES[key].count}"></span>` : ""}
      </a>`).join("")}
  `).join("");
}

function currentPage() {
  const key = location.hash.replace(/^#\/?/, "").split("?")[0];
  return PAGES[key] ? key : "dashboard";
}

async function route() {
  if (!App.admin) return;
  const key = currentPage();
  const page = PAGES[key];
  $$(".nav-item[data-page]").forEach((a) => a.classList.toggle("active", a.dataset.page === key));
  $("#pageTitle").textContent = page.title;
  $("#pageSub").textContent = page.sub;
  document.title = `${page.title} — Intelia Academy`;
  $("#app").classList.remove("nav-open");
  closeAllModals();

  const id = ++App.renderId;
  const content = $("#content");
  content.innerHTML = loadingHtml();
  window.scrollTo(0, 0);
  try {
    await page.render(content, id);
  } catch (err) {
    if (id !== App.renderId) return;
    content.innerHTML = `<div class="panel"><div class="empty">${icon("alert")}<b>Məlumatı yükləmək mümkün olmadı</b>${esc(err.message)}<br>
      <button class="btn btn-outline btn-sm" onclick="route()">${icon("refresh", "icon-sm")} Yenidən cəhd et</button></div></div>`;
  }
}

function isStale(id) { return id !== undefined && id !== App.renderId; }

async function refreshCounts() {
  try {
    const { stats } = await api("/api/dashboard");
    setCount("applications", stats.new_applications);
    setCount("payments", stats.pending_payments, true);
  } catch { /* sayğaclar vacib deyil */ }
}

function setCount(key, n, warn = false) {
  const el = $(`[data-count="${key}"]`);
  if (!el) return;
  el.textContent = n > 99 ? "99+" : n;
  el.classList.toggle("hidden", !n);
  el.classList.toggle("warn", warn);
}

async function loadLookups(force = false) {
  if (App.lookupsLoaded && !force) return App.lookups;
  const [courses, groups, cards, teachers] = await Promise.all([
    api("/api/courses"), api("/api/groups"), api("/api/cards"), api("/api/teachers"),
  ]);
  App.lookups = { courses: courses.items, groups: groups.items, cards: cards.items, teachers: teachers.items };
  App.lookupsLoaded = true;
  return App.lookups;
}

/* =====================================================================
   UI HELPERS
   ===================================================================== */

function loadingHtml() {
  return `<div class="panel" style="padding:20px;display:grid;gap:12px">
    ${[80, 100, 92, 100, 70].map((w) => `<div class="skeleton" style="height:16px;width:${w}%"></div>`).join("")}</div>`;
}

function emptyHtml(title, text = "", action = "", ic = "inbox") {
  return `<div class="empty">${icon(ic)}<b>${esc(title)}</b>${esc(text)}${action ? `<div>${action}</div>` : ""}</div>`;
}

function studentBadge(status) {
  return `<span class="badge ${STUDENT_STATUS_BADGE[status] || "badge-gray"}">${esc(status)}</span>`;
}

function paymentBadge(status, studentView = false) {
  if (!status) return `<span class="badge badge-gray">Ödəniş yoxdur</span>`;
  const label = studentView && status === "Təsdiqləndi" ? "Ödənilib" : status;
  return `<span class="badge ${PAYMENT_BADGE[status] || "badge-gray"}">${esc(label)}</span>`;
}

function activeBadge(active) {
  return active ? `<span class="badge badge-green">Aktiv</span>` : `<span class="badge badge-gray">Deaktiv</span>`;
}

function options(list, selected, { value = "id", label = "name", empty } = {}) {
  const head = empty !== undefined ? `<option value="">${esc(empty)}</option>` : "";
  return head + list.map((item) => {
    const v = typeof item === "object" ? item[value] : item;
    const l = typeof item === "object" ? (typeof label === "function" ? label(item) : item[label]) : item;
    return `<option value="${esc(v)}" ${String(v) === String(selected ?? "") ? "selected" : ""}>${esc(l)}</option>`;
  }).join("");
}

function field(name, labelText, inputHtml, { required = false, full = false, hint = "" } = {}) {
  return `<div class="field ${full ? "full" : ""}" data-field="${name}">
    <label>${esc(labelText)}${required ? ' <span class="req">*</span>' : ""}</label>
    ${inputHtml}${hint ? `<span class="hint">${hint}</span>` : ""}<span class="field-error"></span></div>`;
}

function daysChips(list) {
  return (list || []).length ? `<div class="day-chips">${list.map((d) => `<span class="day-chip" title="${esc(WEEK_DAYS[d])}">${esc(WEEK_DAYS[d])}</span>`).join("")}</div>` : `<span class="muted">Günlər təyin edilməyib</span>`;
}

function paginationHtml(res, label = "nəticə") {
  if (!res.total) return "";
  const from = (res.page - 1) * res.page_size + 1;
  const to = Math.min(res.page * res.page_size, res.total);
  return `<div class="pagination"><span>${from}–${to} / ${res.total} ${label}</span>
    <div class="pager">
      <button class="btn btn-outline btn-sm" data-page-nav="${res.page - 1}" ${res.page <= 1 ? "disabled" : ""}>${icon("chevronLeft", "icon-sm")} Əvvəlki</button>
      <span>${res.page} / ${res.pages}</span>
      <button class="btn btn-outline btn-sm" data-page-nav="${res.page + 1}" ${res.page >= res.pages ? "disabled" : ""}>Növbəti ${icon("chevronRight", "icon-sm")}</button>
    </div></div>`;
}

function setBusy(btn, busy, text) {
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${text || "Gözləyin…"}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

/* ---------- Modal ---------- */

function openModal({ title, sub = "", body = "", foot = "", size = "", drawer = false, onClose }) {
  const overlay = document.createElement("div");
  overlay.className = `overlay ${drawer ? "drawer-overlay" : ""}`;
  overlay.innerHTML = `
    <div class="${drawer ? "drawer" : `modal ${size}`}" role="dialog" aria-modal="true">
      <div class="modal-head"><div><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ""}</div>
        <button class="btn btn-ghost btn-icon" data-close aria-label="Bağla">${icon("x")}</button></div>
      <div class="modal-body">${body}</div>
      ${foot ? `<div class="modal-foot">${foot}</div>` : ""}
    </div>`;
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === "Escape" && overlay === $("#modalRoot").lastElementChild) close(); };
  let downOnOverlay = false;
  overlay.addEventListener("mousedown", (e) => { downOnOverlay = e.target === overlay; });
  overlay.addEventListener("click", (e) => {
    if ((e.target === overlay && downOnOverlay) || e.target.closest("[data-close]")) close();
  });
  document.addEventListener("keydown", onKey);
  $("#modalRoot").appendChild(overlay);
  const first = overlay.querySelector(".modal-body input:not([type=hidden]):not([type=checkbox]), .modal-body select, .modal-body textarea");
  if (first && !drawer) setTimeout(() => first.focus(), 40);
  overlay.close = close;
  return overlay;
}

function closeAllModals() {
  $$("#modalRoot > .overlay").forEach((o) => o.close ? o.close() : o.remove());
}

function confirmDialog({ title = "Təsdiq", message, confirmText = "Təsdiq et", danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const m = openModal({
      title: esc(title),
      size: "sm",
      body: `<p style="margin:0;color:var(--text-2)">${message}</p>`,
      foot: `<button class="btn btn-outline" data-close>Ləğv et</button>
             <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-ok>${esc(confirmText)}</button>`,
      onClose: () => resolve(result),
    });
    $("[data-ok]", m).addEventListener("click", () => { result = true; m.close(); });
    setTimeout(() => $("[data-ok]", m).focus(), 40);
  });
}

/* ---------- Form ---------- */

function formData(form) {
  const data = {};
  new FormData(form).forEach((v, k) => { data[k] = typeof v === "string" ? v.trim() : v; });
  $$("input[type=checkbox][name]", form).forEach((c) => { if (!c.dataset.multi) data[c.name] = c.checked; });
  return data;
}

function clearFormErrors(root) {
  $$(".field.invalid", root).forEach((f) => f.classList.remove("invalid"));
  $$(".field-error", root).forEach((e) => { e.textContent = ""; });
  const box = $(".form-error", root);
  if (box) box.innerHTML = "";
}

function showFormError(root, err) {
  clearFormErrors(root);
  const errors = (err.data && err.data.errors) || [];
  let shown = false;
  errors.forEach(({ field: name, message }) => {
    const f = $(`[data-field="${name}"]`, root);
    if (f) {
      f.classList.add("invalid");
      $(".field-error", f).textContent = message;
      shown = true;
    }
  });
  const box = $(".form-error", root);
  if (box && (!shown || !errors.length)) box.innerHTML = `<div class="alert alert-error" style="margin-top:14px">${icon("alert")}<span>${esc(err.message)}</span></div>`;
  else if (!box) toast(err.message, "error");
}

function requireFields(root, fields) {
  clearFormErrors(root);
  let ok = true;
  fields.forEach(([name, message]) => {
    const f = $(`[data-field="${name}"]`, root);
    const input = f && $("input, select, textarea", f);
    if (input && !String(input.value).trim()) {
      f.classList.add("invalid");
      $(".field-error", f).textContent = message;
      ok = false;
    }
  });
  if (!ok) { const first = $(".field.invalid input, .field.invalid select", root); if (first) first.focus(); }
  return ok;
}

async function downloadFile(path, filename) {
  try {
    const res = await api(path, { raw: true });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (err) { toast(err.message, "error"); }
}

/* =====================================================================
   DASHBOARD
   ===================================================================== */

async function renderDashboard(content, id) {
  const data = await api("/api/dashboard");
  if (isStale(id)) return;
  const s = data.stats;
  setCount("applications", s.new_applications);
  setCount("payments", s.pending_payments, true);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Sabahınız xeyir" : hour < 18 ? "Günortanız xeyir" : "Axşamınız xeyir";

  const kpi = (href, label, value, sub, ic, tone = "") => `
    <a class="kpi" href="${href}"><div class="kpi-top"><span>${label}</span><span class="kpi-icon ${tone}">${icon(ic)}</span></div>
      <div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></a>`;

  content.innerHTML = `
    <section class="welcome">
      <div><h2>${greet}, ${esc(App.admin.full_name.split(" ")[0])}!</h2>
        <p>${s.new_applications ? `${s.new_applications} yeni müraciət və ${s.pending_payments} yoxlanılmamış ödəniş sizi gözləyir.` : "Yeni müraciət yoxdur. Qeydiyyat linkini tələbələrlə paylaşın."}</p></div>
      <div class="link-box"><code>${esc(registrationLink())}</code>
        <button class="btn btn-outline btn-sm" data-copy-link>${icon("copy", "icon-sm")} Kopyala</button></div>
    </section>

    <div class="kpis">
      ${kpi("#/students", "Ümumi tələbə", s.total_students, `Bu ay: +${s.month_registrations} qeydiyyat`, "students", "navy")}
      ${kpi("#/students", "Aktiv tələbələr", s.active_students, `${s.active_courses} aktiv kurs`, "graduation", "green")}
      ${kpi("#/groups", "Qruplar", s.groups_count, `${s.active_groups} aktiv qrup`, "groups", "navy")}
      ${kpi("#/teachers", "Müəllimlər", s.teachers_count, `${s.active_teachers} aktiv müəllim`, "teacher")}
      ${kpi("#/applications", "Gözləyən müraciətlər", s.pending_applications, `${s.new_applications} yeni · ${s.pending_payments} qəbz yoxlanılmalı`, "inbox", "amber")}
      ${kpi("#/payments", "Bu ay ödənişlər", money(s.month_revenue), `${s.month_payments_count} təsdiqlənmiş ödəniş`, "checkCircle", "green")}
      ${kpi("#/students", "Borclar", money(s.debt_total), `${s.debtors_count} borclu tələbə`, "debt", "amber").replace('class="kpi"', 'class="kpi" data-debtors')}
      ${kpi("#/expenses", "Bu ay xərclər", money(s.month_expenses), `Balans: ${money(s.month_revenue - s.month_expenses)}`, "receipt", "navy")}
    </div>

    <div class="grid-2">
      <section class="panel">
        <div class="panel-head"><div><h3>Son qeydiyyatlar</h3><p>Ən son qeydiyyatdan keçən tələbələr</p></div>
          <a class="btn btn-ghost btn-sm" href="#/applications">Hamısı ${icon("arrowRight", "icon-sm")}</a></div>
        ${data.recent_applications.length ? `<div class="table-wrap"><table class="table"><tbody>
          ${data.recent_applications.map((st) => `
            <tr class="clickable" data-student="${st.id}">
              <td><div class="cell-main"><div class="avatar soft">${esc(initials(st.full_name))}</div>
                <div><b>${esc(st.full_name)}</b><small>${esc(st.course_name || "Kurs seçilməyib")}</small></div></div></td>
              <td>${studentBadge(st.status)}</td>
              <td class="num sub">${esc(timeAgo(st.created_at))}</td>
            </tr>`).join("")}
        </tbody></table></div>` : emptyHtml("Hələ müraciət yoxdur", "Qeydiyyat linki ilə gələn müraciətlər burada görünəcək.")}
      </section>

      <section class="panel">
        <div class="panel-head"><div><h3>Son ödənişlər</h3><p>Yüklənmiş qəbzlər və statuslar</p></div>
          <a class="btn btn-ghost btn-sm" href="#/payments">Hamısı ${icon("arrowRight", "icon-sm")}</a></div>
        ${data.recent_payments.length ? `<div class="table-wrap"><table class="table"><tbody>
          ${data.recent_payments.map((p) => `
            <tr class="clickable" data-student="${p.student_id || ""}">
              <td><div class="cell-main"><div><b>${esc(p.student_name || "Silinmiş tələbə")}</b><small>${esc(p.course_name || "—")}</small></div></div></td>
              <td class="num"><b>${money(p.amount)}</b></td>
              <td>${paymentBadge(p.status)}</td>
            </tr>`).join("")}
        </tbody></table></div>` : emptyHtml("Hələ ödəniş yoxdur", "Tələbələrin yüklədiyi qəbzlər burada görünəcək.", "", "wallet")}
      </section>
    </div>`;

  $("[data-copy-link]", content).addEventListener("click", () => copyText(registrationLink()));
  $("[data-debtors]", content).addEventListener("click", () => {
    Object.assign(listState.students, { q: "", status: "", course_id: "", group_id: "", payment_status: "Borclu", page: 1 });
  });
  $$("[data-student]", content).forEach((tr) => tr.addEventListener("click", () => {
    if (tr.dataset.student) openStudent(Number(tr.dataset.student), () => route());
  }));
}

/* =====================================================================
   STUDENTS + APPLICATIONS
   ===================================================================== */

const listState = {
  students: { q: "", status: "", course_id: "", group_id: "", payment_status: "", page: 1 },
  applications: { q: "", status: "", course_id: "", group_id: "", payment_status: "", page: 1 },
};

async function renderStudentList(content, mode, id) {
  const { courses, groups } = await loadLookups();
  if (isStale(id)) return;
  const st = listState[mode];
  const isApp = mode === "applications";

  content.innerHTML = `
    <div class="toolbar">
      <div class="tabs" id="statusTabs"></div>
      <span class="grow"></span>
      ${!isApp ? `<button class="btn btn-outline" id="exportBtn">${icon("download")} Excel (CSV)</button>` : ""}
      <button class="btn btn-primary" id="addStudentBtn">${icon("plus")} Yeni tələbə</button>
    </div>
    <div class="toolbar">
      <label class="search-box"><span class="sr-only">Axtar</span>${icon("search")}
        <input class="input" id="q" placeholder="Ad, telefon, e-poçt, kod (IA-00012)…" value="${esc(st.q)}"></label>
      <select class="select" id="fCourse">${options(courses, st.course_id, { empty: "Bütün kurslar" })}</select>
      <select class="select" id="fGroup"></select>
      <select class="select" id="fPay">${options([
        { v: "Borclu", l: "Borclu tələbələr" }, { v: "Gözləyir", l: "Ödəniş: gözləyir" }, { v: "Təsdiqləndi", l: "Ödəniş: təsdiqlənib" },
        { v: "Rədd edildi", l: "Ödəniş: rədd edilib" }, { v: "Yoxdur", l: "Ödəniş yoxdur" }], st.payment_status, { value: "v", label: "l", empty: "Ödəniş: hamısı" })}</select>
    </div>
    <section class="panel"><div id="listArea">${loadingHtml()}</div></section>`;

  const fillGroups = () => {
    const list = groups.filter((g) => !st.course_id || String(g.course_id) === String(st.course_id));
    $("#fGroup", content).innerHTML = `<option value="">Bütün qruplar</option><option value="0" ${st.group_id === "0" ? "selected" : ""}>Qrupsuz</option>` +
      options(list, st.group_id, { label: (g) => `${g.name} · ${g.course_name}` });
  };
  fillGroups();

  const load = async () => {
    const params = new URLSearchParams({ page: st.page, page_size: 20 });
    if (isApp) params.set("view", "applications");
    ["q", "status", "course_id", "group_id", "payment_status"].forEach((k) => { if (st[k] !== "") params.set(k, st[k]); });
    const area = $("#listArea", content);
    let res;
    try { res = await api(`/api/students?${params}`); } catch (err) { area.innerHTML = emptyHtml("Xəta", err.message, "", "alert"); return; }
    if (isStale(id)) return;
    renderTabs(res.status_counts);
    if (!res.items.length) {
      const filtered = st.q || st.status || st.course_id || st.group_id || st.payment_status;
      area.innerHTML = filtered
        ? emptyHtml("Nəticə tapılmadı", "Axtarış və ya filtrləri dəyişib yenidən yoxlayın.", "", "search")
        : emptyHtml(isApp ? "Yeni müraciət yoxdur" : "Hələ tələbə yoxdur",
            isApp ? "Qeydiyyat linkindən gələn müraciətlər burada görünəcək." : "Tələbələr qeydiyyat linki ilə və ya əl ilə əlavə oluna bilər.",
            `<button class="btn btn-outline btn-sm" data-copy-link>${icon("copy", "icon-sm")} Qeydiyyat linkini kopyala</button>`, isApp ? "inbox" : "students");
      const c = $("[data-copy-link]", area);
      if (c) c.addEventListener("click", () => copyText(registrationLink()));
      return;
    }
    area.innerHTML = `<div class="table-wrap"><table class="table stack">
      <thead><tr><th>Tələbə</th><th>Əlaqə</th><th>Kurs / Qrup</th><th>Ödəniş</th><th>Status</th><th>Tarix</th><th></th></tr></thead>
      <tbody>${res.items.map((s) => `
        <tr class="clickable" data-id="${s.id}">
          <td><div class="cell-main"><div class="avatar soft">${esc(initials(s.full_name))}</div><div><b>${esc(s.full_name)}</b><small>${esc(s.code)} · ${esc(s.source)}</small></div></div></td>
          <td class="nowrap" data-label="Əlaqə"><div>${esc(formatPhone(s.phone))}${s.email ? `<span class="sub">${esc(s.email)}</span>` : ""}</div></td>
          <td data-label="Kurs / Qrup"><div><b class="nowrap" style="font-weight:600">${esc(s.course_name || "—")}</b><span class="sub">${esc(s.group_name || "Qrupsuz")}</span></div></td>
          <td data-label="Ödəniş"><div>${paymentBadge(s.payment_status, true)}${s.debt > 0 ? `<span class="sub debt">Borc: ${money(s.debt)}</span>` : s.paid_amount ? `<span class="sub">${money(s.paid_amount)}</span>` : ""}</div></td>
          <td data-label="Status"><select class="select status-select" data-status="${s.id}" aria-label="Status">${options(STUDENT_STATUSES, s.status)}</select></td>
          <td class="nowrap sub" data-label="Tarix">${esc(formatDate(s.created_at))}</td>
          <td class="actions">
            <button class="btn btn-ghost btn-icon" data-view="${s.id}" title="Ətraflı">${icon("eye")}</button>
            <button class="btn btn-ghost btn-icon" data-del="${s.id}" data-name="${esc(s.full_name)}" title="Sil">${icon("trash")}</button>
          </td>
        </tr>`).join("")}</tbody></table></div>${paginationHtml(res, "tələbə")}`;

    $$("tr[data-id]", area).forEach((tr) => tr.addEventListener("click", (e) => {
      if (e.target.closest("select, button")) return;
      openStudent(Number(tr.dataset.id), load);
    }));
    $$("[data-view]", area).forEach((b) => b.addEventListener("click", () => openStudent(Number(b.dataset.view), load)));
    $$("[data-status]", area).forEach((sel) => sel.addEventListener("change", async () => {
      try {
        await api(`/api/students/${sel.dataset.status}`, { method: "PUT", body: { status: sel.value } });
        toast("Status yeniləndi");
        refreshCounts();
        load();
      } catch (err) { toast(err.message, "error"); load(); }
    }));
    $$("[data-del]", area).forEach((b) => b.addEventListener("click", () => deleteStudent(Number(b.dataset.del), b.dataset.name, load)));
    $$("[data-page-nav]", area).forEach((b) => b.addEventListener("click", () => { st.page = Number(b.dataset.pageNav); load(); }));
  };

  function renderTabs(counts) {
    const keys = isApp ? ["Yeni", "Əlaqə saxlanılıb"] : STUDENT_STATUSES;
    const total = keys.reduce((n, k) => n + (counts[k] || 0), 0);
    $("#statusTabs", content).innerHTML = `<button class="tab ${!st.status ? "active" : ""}" data-tab="">Hamısı <span class="n">${total}</span></button>` +
      keys.map((k) => `<button class="tab ${st.status === k ? "active" : ""}" data-tab="${esc(k)}">${esc(k)} <span class="n">${counts[k] || 0}</span></button>`).join("");
    $$("[data-tab]", content).forEach((t) => t.addEventListener("click", () => { st.status = t.dataset.tab; st.page = 1; load(); }));
  }

  $("#q", content).addEventListener("input", debounce((e) => { st.q = e.target.value.trim(); st.page = 1; load(); }, 300));
  $("#fCourse", content).addEventListener("change", (e) => { st.course_id = e.target.value; st.group_id = ""; st.page = 1; fillGroups(); load(); });
  $("#fGroup", content).addEventListener("change", (e) => { st.group_id = e.target.value; st.page = 1; load(); });
  $("#fPay", content).addEventListener("change", (e) => { st.payment_status = e.target.value; st.page = 1; load(); });
  $("#addStudentBtn", content).addEventListener("click", () => openStudentForm(null, load));
  const exp = $("#exportBtn", content);
  if (exp) exp.addEventListener("click", () => downloadFile("/api/reports/export/students", "telebeler.csv"));
  await load();
}

async function deleteStudent(studentId, name, after) {
  const ok = await confirmDialog({
    title: "Tələbəni sil",
    message: `<b>${esc(name)}</b> və ona aid bütün ödəniş qeydləri və qəbzlər birdəfəlik silinəcək. Bu əməliyyat geri qaytarıla bilməz.`,
    confirmText: "Sil", danger: true,
  });
  if (!ok) return false;
  try {
    await api(`/api/students/${studentId}`, { method: "DELETE" });
    toast("Tələbə silindi");
    refreshCounts();
    if (after) after();
    return true;
  } catch (err) { toast(err.message, "error"); return false; }
}

async function openStudentForm(student, after) {
  const { courses, groups } = await loadLookups();
  const s = student || { status: "Yeni" };
  const levels = [...EDUCATION_LEVELS];
  if (s.education_level && !levels.includes(s.education_level)) levels.push(s.education_level);
  const groupOptions = (courseId) => `<option value="">Qrupsuz</option>` +
    options(groups.filter((g) => String(g.course_id) === String(courseId)), s.group_id, { label: (g) => `${g.name}${g.days_label ? " · " + g.days_label : ""}` });

  const m = openModal({
    title: student ? "Tələbə məlumatlarını redaktə et" : "Yeni tələbə",
    sub: student ? esc(student.code) : "Tələbəni əl ilə sistemə əlavə edin",
    body: `<form id="studentForm" novalidate><div class="form-grid">
      ${field("first_name", "Ad", `<input class="input" name="first_name" maxlength="60" value="${esc(s.first_name || "")}">`, { required: true })}
      ${field("last_name", "Soyad", `<input class="input" name="last_name" maxlength="60" value="${esc(s.last_name || "")}">`, { required: true })}
      ${field("phone", "Telefon", `<input class="input" name="phone" type="tel" placeholder="+994 50 123 45 67" value="${esc(formatPhone(s.phone || ""))}">`, { required: true })}
      ${field("email", "E-poçt", `<input class="input" name="email" type="email" maxlength="120" placeholder="ad@gmail.com" value="${esc(s.email || "")}">`)}
      ${field("education_level", "Təhsil səviyyəsi", `<select class="select" name="education_level">${options(levels, s.education_level, { empty: "Seçin" })}</select>`)}
      ${field("graduation_status", "Universiteti bitirib?", `<select class="select" name="graduation_status">${options([{ v: "Bitirib", l: "Bitirib" }, { v: "Oxuyur", l: "Oxuyur (bitirməyib)" }], s.graduation_status, { value: "v", label: "l", empty: "Qeyd edilməyib" })}</select>`)}
      ${field("university", "Universitet", `<input class="input" name="university" maxlength="160" value="${esc(s.university || "")}">`)}
      ${field("specialty", "İxtisas", `<input class="input" name="specialty" maxlength="160" value="${esc(s.specialty || "")}">`)}
      ${field("course_id", "Kurs", `<select class="select" name="course_id">${options(courses, s.course_id, { empty: "Kurs seçilməyib" })}</select>`)}
      ${field("group_id", "Qrup", `<select class="select" name="group_id">${groupOptions(s.course_id)}</select>`)}
      ${field("status", "Status", `<select class="select" name="status">${options(STUDENT_STATUSES, s.status)}</select>`)}
      ${field("note", "Qeyd", `<textarea class="textarea" name="note" maxlength="2000" placeholder="Daxili qeyd (tələbə görmür)">${esc(s.note || "")}</textarea>`, { full: true })}
    </div><div class="form-error"></div></form>`,
    foot: `<button class="btn btn-outline" data-close>Ləğv et</button><button class="btn btn-primary" id="saveStudent">${icon("check")} Yadda saxla</button>`,
  });
  const form = $("#studentForm", m);
  $("[name=course_id]", form).addEventListener("change", (e) => { $("[name=group_id]", form).innerHTML = groupOptions(e.target.value); });
  const save = async (e) => {
    if (e) e.preventDefault();
    if (!requireFields(form, [["first_name", "Ad daxil edin."], ["last_name", "Soyad daxil edin."], ["phone", "Telefon daxil edin."]])) return;
    const d = formData(form);
    const body = {
      first_name: d.first_name, last_name: d.last_name, phone: d.phone, email: d.email || null,
      education_level: d.education_level || null, graduation_status: d.graduation_status || null,
      university: d.university || null, specialty: d.specialty || null,
      course_id: d.course_id ? Number(d.course_id) : null, group_id: d.group_id ? Number(d.group_id) : null,
      status: d.status, note: d.note || null,
    };
    const btn = $("#saveStudent", m);
    setBusy(btn, true, "Saxlanılır…");
    try {
      const saved = await api(student ? `/api/students/${student.id}` : "/api/students", { method: student ? "PUT" : "POST", body });
      toast(student ? "Məlumatlar yeniləndi" : "Tələbə əlavə edildi");
      m.close();
      refreshCounts();
      if (after) after(saved);
    } catch (err) { showFormError(form, err); setBusy(btn, false); }
  };
  form.addEventListener("submit", save);
  $("#saveStudent", m).addEventListener("click", save);
}

async function openStudent(studentId, after) {
  let s;
  try { s = await api(`/api/students/${studentId}`); } catch (err) { toast(err.message, "error"); return; }
  const waNumber = String(s.phone || "").replace(/\D/g, "");
  const info = [
    ["Telefon", formatPhone(s.phone)], ["E-poçt", s.email || "—"],
    ["Təhsil", s.education_level || "—"], ["Təhsil vəziyyəti", s.graduation_status || "—"],
    ["Universitet", s.university || "—"], ["İxtisas", s.specialty || "—"],
    ["Kurs", s.course_name ? `${s.course_name} · ${money(s.course_price)}` : "—"], ["Qrup", s.group_name || "Qrupsuz"],
    ["Dərs günləri", s.group_days_label || "—"], ["Dərs saatı", timeRange(s.group_start_time, s.group_end_time) || "—"],
    ["Ödənilib", money(s.paid_amount)], ["Borc", s.debt > 0 ? money(s.debt) : "Yoxdur"],
    ["Mənbə", s.source], ["Qeydiyyat tarixi", formatDate(s.created_at, true)],
  ];

  const m = openModal({
    drawer: true,
    title: `<div class="profile-head"><div class="avatar">${esc(initials(s.full_name))}</div><div><div>${esc(s.full_name)}</div>
      <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap"><span class="badge badge-gray no-dot">${esc(s.code)}</span>${studentBadge(s.status)}${paymentBadge(s.payment_status, true)}</div></div></div>`,
    body: `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        <a class="btn btn-outline btn-sm" href="tel:${esc(s.phone)}">${icon("phone", "icon-sm")} Zəng et</a>
        <a class="btn btn-outline btn-sm" href="https://wa.me/${esc(waNumber)}" target="_blank" rel="noopener">${icon("message", "icon-sm")} WhatsApp</a>
        ${s.email ? `<a class="btn btn-outline btn-sm" href="mailto:${esc(s.email)}">${icon("mail", "icon-sm")} E-poçt</a>` : ""}
        <button class="btn btn-outline btn-sm" id="editStudent">${icon("edit", "icon-sm")} Redaktə et</button>
      </div>
      <div class="field" style="margin-bottom:16px"><label>Status</label>
        <select class="select" id="drawerStatus">${options(STUDENT_STATUSES, s.status)}</select></div>
      <div class="info-grid">${info.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join("")}</div>
      ${s.note ? `<div class="section-title">Qeyd</div><div class="alert alert-info">${icon("info")}<span>${esc(s.note)}</span></div>` : ""}
      <div class="section-title"><span>Ödənişlər (${s.payments.length})</span>
        <button class="btn btn-outline btn-sm" id="addPayment">${icon("plus", "icon-sm")} Ödəniş əlavə et</button></div>
      <div id="payList">${s.payments.length ? s.payments.map(paymentItemHtml).join("") : `<div class="empty" style="padding:24px">Ödəniş qeydi yoxdur</div>`}</div>`,
    foot: `<button class="btn btn-danger-soft left" id="delStudent">${icon("trash", "icon-sm")} Sil</button><button class="btn btn-outline" data-close>Bağla</button>`,
  });

  const reopen = () => { m.close(); if (after) after(); openStudent(studentId, after); };
  $("#drawerStatus", m).addEventListener("change", async (e) => {
    try {
      await api(`/api/students/${studentId}`, { method: "PUT", body: { status: e.target.value } });
      toast("Status yeniləndi");
      refreshCounts();
      reopen();
    } catch (err) { toast(err.message, "error"); }
  });
  $("#editStudent", m).addEventListener("click", () => openStudentForm(s, () => reopen()));
  $("#addPayment", m).addEventListener("click", () => openPaymentForm({ student: s }, reopen));
  $("#delStudent", m).addEventListener("click", async () => {
    if (await deleteStudent(studentId, s.full_name)) { m.close(); if (after) after(); }
  });
  bindPaymentActions(m, reopen);
}

function paymentItemHtml(p) {
  return `<div class="pay-item">
    <div class="row"><span class="amount">${money(p.amount)}</span>${paymentBadge(p.status)}</div>
    <div class="row sub" style="white-space:normal"><span>${icon("card", "icon-sm")} ${esc(p.card_label || "—")}</span><span>${esc(formatDate(p.paid_at || p.created_at, true))}</span></div>
    ${p.admin_note ? `<div class="sub" style="white-space:normal">Qeyd: ${esc(p.admin_note)}</div>` : ""}
    ${p.reviewed_by_name ? `<div class="sub">Yoxlayan: ${esc(p.reviewed_by_name)} · ${esc(formatDate(p.reviewed_at, true))}</div>` : ""}
    <div class="row" style="justify-content:flex-start;gap:6px">
      ${p.has_receipt ? `<button class="btn btn-outline btn-sm" data-receipt="${p.id}" data-rname="${esc(p.receipt_name || "")}">${icon("file", "icon-sm")} Qəbzə bax</button>` : `<span class="sub">Qəbz yoxdur</span>`}
      ${paymentActionButtons(p)}
    </div></div>`;
}

function paymentActionButtons(p) {
  if (p.status === "Gözləyir") {
    return `<button class="btn btn-success btn-sm" data-pay-approve="${p.id}">${icon("check", "icon-sm")} Təsdiqlə</button>
            <button class="btn btn-danger-soft btn-sm" data-pay-reject="${p.id}">${icon("x", "icon-sm")} Rədd et</button>`;
  }
  return `<button class="btn btn-ghost btn-sm" data-pay-reset="${p.id}" title="Statusu “Gözləyir”ə qaytar">${icon("refresh", "icon-sm")} Geri al</button>`;
}

function bindPaymentActions(root, after) {
  $$("[data-receipt]", root).forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); openReceipt(Number(b.dataset.receipt), b.dataset.rname); }));
  $$("[data-pay-approve]", root).forEach((b) => b.addEventListener("click", async (e) => {
    e.stopPropagation();
    setBusy(b, true, "");
    await setPaymentStatus(Number(b.dataset.payApprove), "Təsdiqləndi", null, after);
  }));
  $$("[data-pay-reject]", root).forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); openRejectDialog(Number(b.dataset.payReject), after); }));
  $$("[data-pay-reset]", root).forEach((b) => b.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (await confirmDialog({ title: "Statusu geri al", message: "Ödəniş yenidən “Gözləyir” statusuna qaytarılsın?", confirmText: "Geri al" })) {
      await setPaymentStatus(Number(b.dataset.payReset), "Gözləyir", null, after);
    }
  }));
}

async function setPaymentStatus(paymentId, status, note, after) {
  try {
    const body = { status };
    if (note !== null && note !== undefined) body.admin_note = note;
    await api(`/api/payments/${paymentId}`, { method: "PUT", body });
    toast(status === "Təsdiqləndi" ? "Ödəniş təsdiqləndi" : status === "Rədd edildi" ? "Ödəniş rədd edildi" : "Status yeniləndi");
    refreshCounts();
    if (after) after();
  } catch (err) { toast(err.message, "error"); if (after) after(); }
}

function openRejectDialog(paymentId, after) {
  const m = openModal({
    title: "Ödənişi rədd et", size: "sm",
    body: `${field("admin_note", "Səbəb", `<textarea class="textarea" id="rejectNote" maxlength="1000" placeholder="Məs. qəbzdə məbləğ uyğun deyil"></textarea>`, { hint: "Daxili qeyd kimi saxlanılır." })}`,
    foot: `<button class="btn btn-outline" data-close>Ləğv et</button><button class="btn btn-danger" id="doReject">Rədd et</button>`,
  });
  $("#doReject", m).addEventListener("click", async () => {
    setBusy($("#doReject", m), true, "");
    await setPaymentStatus(paymentId, "Rədd edildi", $("#rejectNote", m).value.trim() || null, after);
    m.close();
  });
}

async function openReceipt(paymentId, name) {
  let url;
  const m = openModal({
    title: "Ödəniş qəbzi", sub: esc(name || ""), size: "lg",
    body: `<div class="receipt-view"><span class="spinner"></span></div>`,
    onClose: () => { if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); },
  });
  try {
    const res = await api(`/api/payments/${paymentId}/receipt`, { raw: true });
    const blob = await res.blob();
    url = URL.createObjectURL(blob);
    const type = blob.type || "";
    const view = $(".receipt-view", m);
    if (type.startsWith("image/") && !/heic/.test(type)) view.innerHTML = `<img src="${url}" alt="Ödəniş qəbzi">`;
    else if (type === "application/pdf") view.innerHTML = `<iframe src="${url}" title="Ödəniş qəbzi"></iframe>`;
    else view.innerHTML = `<div class="empty">${icon("file")}<b>Önizləmə mümkün deyil</b>Faylı yükləyib baxın.</div>`;
    const body = $(".modal-body", m);
    body.insertAdjacentHTML("beforeend", `<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <a class="btn btn-outline btn-sm" href="${url}" target="_blank" rel="noopener">${icon("external", "icon-sm")} Yeni pəncərədə aç</a>
      <a class="btn btn-primary btn-sm" href="${url}" download="${esc(name || "qebz")}">${icon("download", "icon-sm")} Yüklə</a></div>`);
  } catch (err) {
    $(".receipt-view", m).innerHTML = `<div class="empty">${icon("alert")}<b>Qəbz açılmadı</b>${esc(err.message)}</div>`;
  }
}

async function openPaymentForm({ student = null } = {}, after) {
  const { cards } = await loadLookups();
  let students = [];
  if (!student) {
    const res = await api("/api/students?page_size=200");
    students = res.items;
    if (!students.length) { toast("Əvvəlcə tələbə əlavə edin", "error"); return; }
  }
  const m = openModal({
    title: "Ödəniş əlavə et", sub: student ? esc(student.full_name) : "Nağd və ya köçürmə ilə qəbul edilən ödənişi qeyd edin",
    body: `<form id="payForm" novalidate><div class="form-grid">
      ${student ? "" : field("student_id", "Tələbə", `<select class="select" name="student_id">${options(students, "", { empty: "Tələbə seçin", label: (s) => `${s.full_name} · ${s.code}${s.course_name ? " · " + s.course_name : ""}` })}</select>`, { required: true, full: true })}
      ${field("amount", "Məbləğ (₼)", `<input class="input" name="amount" type="number" min="0" step="0.01" value="${student && student.course_price ? student.course_price : ""}">`, { required: true })}
      ${field("card_id", "Kart", `<select class="select" name="card_id">${options(cards, "", { empty: "Nağd / digər", label: (c) => `${c.bank_name} •••• ${String(c.card_number).slice(-4)}` })}</select>`)}
      ${field("status", "Status", `<select class="select" name="status">${options(PAYMENT_STATUSES, "Təsdiqləndi")}</select>`)}
      ${field("paid_at", "Ödəniş tarixi", `<input class="input" name="paid_at" type="date" value="${new Date().toISOString().slice(0, 10)}">`)}
      ${field("receipt", "Qəbz (istəyə görə)", `<input class="input" name="receipt" type="file" accept="image/*,application/pdf" style="padding-top:8px">`, { full: true })}
      ${field("admin_note", "Qeyd", `<textarea class="textarea" name="admin_note" maxlength="1000"></textarea>`, { full: true })}
    </div><div class="form-error"></div></form>`,
    foot: `<button class="btn btn-outline" data-close>Ləğv et</button><button class="btn btn-primary" id="savePay">${icon("check")} Yadda saxla</button>`,
  });
  const form = $("#payForm", m);
  if (!student) {
    $("[name=student_id]", form).addEventListener("change", (e) => {
      const s = students.find((x) => String(x.id) === e.target.value);
      if (s && s.course_price) $("[name=amount]", form).value = s.course_price;
    });
  }
  $("#savePay", m).addEventListener("click", async () => {
    const req = [["amount", "Məbləği daxil edin."]];
    if (!student) req.unshift(["student_id", "Tələbə seçin."]);
    if (!requireFields(form, req)) return;
    const fd = new FormData(form);
    if (student) fd.set("student_id", student.id);
    if (!fd.get("card_id")) fd.delete("card_id");
    const file = fd.get("receipt");
    if (!file || !file.size) fd.delete("receipt");
    if (!fd.get("admin_note")) fd.delete("admin_note");
    const btn = $("#savePay", m);
    setBusy(btn, true, "Saxlanılır…");
    try {
      await api("/api/payments", { method: "POST", form: fd });
      toast("Ödəniş əlavə edildi");
      m.close();
      refreshCounts();
      if (after) after();
    } catch (err) { showFormError(form, err); setBusy(btn, false); }
  });
}

/* =====================================================================
   PAYMENTS
   ===================================================================== */

const payState = { q: "", status: "Gözləyir", course_id: "", page: 1 };

async function renderPayments(content, id) {
  const { courses } = await loadLookups();
  if (isStale(id)) return;
  const st = payState;
  content.innerHTML = `
    <div class="grid-3" id="paySummary" style="margin-bottom:18px"></div>
    <div class="toolbar">
      <div class="tabs" id="payTabs"></div>
      <span class="grow"></span>
      <button class="btn btn-outline" id="exportPay">${icon("download")} Excel (CSV)</button>
      <button class="btn btn-primary" id="addPay">${icon("plus")} Ödəniş əlavə et</button>
    </div>
    <div class="toolbar">
      <label class="search-box"><span class="sr-only">Axtar</span>${icon("search")}<input class="input" id="pq" placeholder="Tələbə, telefon, kurs, kart…" value="${esc(st.q)}"></label>
      <select class="select" id="pCourse">${options(courses, st.course_id, { empty: "Bütün kurslar" })}</select>
    </div>
    <section class="panel"><div id="payArea">${loadingHtml()}</div></section>`;

  const load = async () => {
    const params = new URLSearchParams({ page: st.page, page_size: 20 });
    ["q", "status", "course_id"].forEach((k) => { if (st[k]) params.set(k, st[k]); });
    let res;
    try { res = await api(`/api/payments?${params}`); } catch (err) { $("#payArea", content).innerHTML = emptyHtml("Xəta", err.message, "", "alert"); return; }
    if (isStale(id)) return;
    const sm = res.summary;
    $("#paySummary", content).innerHTML = [
      ["Gözləyir", "hourglass", "amber"], ["Təsdiqləndi", "checkCircle", "green"], ["Rədd edildi", "x", "navy"],
    ].map(([k, ic, tone]) => `<div class="kpi"><div class="kpi-top"><span>${k}</span><span class="kpi-icon ${tone}">${icon(ic)}</span></div>
      <div class="kpi-value">${sm[k].count}</div><div class="kpi-sub">${money(sm[k].amount)}</div></div>`).join("");
    const all = PAYMENT_STATUSES.reduce((n, k) => n + sm[k].count, 0);
    $("#payTabs", content).innerHTML = `<button class="tab ${!st.status ? "active" : ""}" data-tab="">Hamısı <span class="n">${all}</span></button>` +
      PAYMENT_STATUSES.map((k) => `<button class="tab ${st.status === k ? "active" : ""}" data-tab="${k}">${k} <span class="n">${sm[k].count}</span></button>`).join("");
    $$("[data-tab]", content).forEach((t) => t.addEventListener("click", () => { st.status = t.dataset.tab; st.page = 1; load(); }));

    const area = $("#payArea", content);
    if (!res.items.length) {
      area.innerHTML = st.q || st.course_id || st.status
        ? emptyHtml(st.status === "Gözləyir" && !st.q && !st.course_id ? "Yoxlanılmamış ödəniş yoxdur" : "Nəticə tapılmadı",
            st.status === "Gözləyir" && !st.q ? "Bütün qəbzlər yoxlanılıb." : "Filtrləri dəyişib yenidən yoxlayın.", "", "wallet")
        : emptyHtml("Hələ ödəniş yoxdur", "Qeydiyyat zamanı yüklənən qəbzlər burada görünəcək.", "", "wallet");
      return;
    }
    area.innerHTML = `<div class="table-wrap"><table class="table stack">
      <thead><tr><th>Tələbə</th><th>Kurs</th><th class="num">Məbləğ</th><th>Kart</th><th>Tarix</th><th>Qəbz</th><th>Status</th><th></th></tr></thead>
      <tbody>${res.items.map((p) => `
        <tr class="clickable" data-sid="${p.student_id || ""}">
          <td><div class="cell-main"><div><b>${esc(p.student_name || "Silinmiş tələbə")}</b><small>${esc(p.student_code || "")} · ${esc(formatPhone(p.student_phone))}</small></div></div></td>
          <td class="nowrap" data-label="Kurs">${esc(p.course_name || "—")}</td>
          <td class="num" data-label="Məbləğ"><b>${money(p.amount)}</b></td>
          <td data-label="Kart"><span class="sub" style="white-space:normal;max-width:220px">${esc(p.card_label || "—")}</span></td>
          <td class="nowrap sub" data-label="Tarix">${esc(formatDate(p.paid_at || p.created_at, true))}</td>
          <td data-label="Qəbz">${p.has_receipt ? `<button class="btn btn-outline btn-sm" data-receipt="${p.id}" data-rname="${esc(p.receipt_name || "")}">${icon("file", "icon-sm")} Bax</button>` : `<span class="sub">—</span>`}</td>
          <td data-label="Status"><div>${paymentBadge(p.status)}${p.admin_note ? `<span class="sub" title="${esc(p.admin_note)}" style="max-width:160px;overflow:hidden;text-overflow:ellipsis">${esc(p.admin_note)}</span>` : ""}</div></td>
          <td class="actions">${paymentActionButtons(p)}
            <button class="btn btn-ghost btn-icon" data-pdel="${p.id}" title="Sil">${icon("trash")}</button></td>
        </tr>`).join("")}</tbody></table></div>${paginationHtml(res, "ödəniş")}`;
    bindPaymentActions(area, load);
    $$("tr[data-sid]", area).forEach((tr) => tr.addEventListener("click", (e) => {
      if (e.target.closest("button") || !tr.dataset.sid) return;
      openStudent(Number(tr.dataset.sid), load);
    }));
    $$("[data-pdel]", area).forEach((b) => b.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!(await confirmDialog({ title: "Ödənişi sil", message: "Ödəniş qeydi və qəbz faylı birdəfəlik silinəcək.", confirmText: "Sil", danger: true }))) return;
      try { await api(`/api/payments/${b.dataset.pdel}`, { method: "DELETE" }); toast("Ödəniş silindi"); refreshCounts(); load(); }
      catch (err) { toast(err.message, "error"); }
    }));
    $$("[data-page-nav]", area).forEach((b) => b.addEventListener("click", () => { st.page = Number(b.dataset.pageNav); load(); }));
  };

  $("#pq", content).addEventListener("input", debounce((e) => { st.q = e.target.value.trim(); st.page = 1; load(); }));
  $("#pCourse", content).addEventListener("change", (e) => { st.course_id = e.target.value; st.page = 1; load(); });
  $("#addPay", content).addEventListener("click", () => openPaymentForm({}, load));
  $("#exportPay", content).addEventListener("click", () => downloadFile("/api/reports/export/payments", "odenisler.csv"));
  await load();
}

/* =====================================================================
   COURSES
   ===================================================================== */

async function renderCourses(content, id) {
  const res = await api("/api/courses");
  if (isStale(id)) return;
  content.innerHTML = `
    <div class="toolbar"><span class="grow"></span><button class="btn btn-primary" id="addCourse">${icon("plus")} Yeni kurs</button></div>
    <section class="panel">${res.items.length ? `<div class="table-wrap"><table class="table stack">
      <thead><tr><th>Kurs</th><th class="num">Qiymət</th><th>Müddət</th><th class="num">Qruplar</th><th class="num">Tələbələr</th><th>Status</th><th></th></tr></thead>
      <tbody>${res.items.map((c) => `<tr>
        <td><div class="cell-main"><div class="kpi-icon">${icon("book")}</div><div><b>${esc(c.name)}</b>
          <small style="white-space:normal;max-width:380px">${esc((c.description || "Təsvir yoxdur").slice(0, 110))}${(c.description || "").length > 110 ? "…" : ""}</small></div></div></td>
        <td class="num" data-label="Qiymət"><b>${money(c.price)}</b></td>
        <td class="nowrap" data-label="Müddət">${esc(c.duration || "—")}</td>
        <td class="num" data-label="Aktiv / ümumi qrup">${c.active_groups_count} / ${c.groups_count}</td>
        <td class="num" data-label="Tələbələr"><div>${c.students_count}<span class="sub">${c.active_students_count} aktiv</span></div></td>
        <td data-label="Status"><label class="switch"><input type="checkbox" data-toggle="${c.id}" ${c.is_active ? "checked" : ""}><span class="track"></span><span class="sub">${c.is_active ? "Aktiv" : "Deaktiv"}</span></label></td>
        <td class="actions"><button class="btn btn-ghost btn-icon" data-edit="${c.id}" title="Redaktə">${icon("edit")}</button>
          <button class="btn btn-ghost btn-icon" data-del="${c.id}" title="Sil">${icon("trash")}</button></td>
      </tr>`).join("")}</tbody></table></div>`
      : emptyHtml("Hələ kurs yoxdur", "Qeydiyyat səhifəsində göstərilməsi üçün ilk kursu əlavə edin.", `<button class="btn btn-primary btn-sm" data-add>${icon("plus", "icon-sm")} Kurs əlavə et</button>`, "book")}</section>`;

  const reload = () => { App.lookupsLoaded = false; route(); };
  $("#addCourse", content).addEventListener("click", () => openCourseForm(null, reload));
  const add = $("[data-add]", content); if (add) add.addEventListener("click", () => openCourseForm(null, reload));
  $$("[data-edit]", content).forEach((b) => b.addEventListener("click", () => openCourseForm(res.items.find((c) => c.id === Number(b.dataset.edit)), reload)));
  $$("[data-toggle]", content).forEach((t) => t.addEventListener("change", async () => {
    try { await api(`/api/courses/${t.dataset.toggle}`, { method: "PUT", body: { is_active: t.checked } }); toast(t.checked ? "Kurs aktiv edildi" : "Kurs deaktiv edildi"); reload(); }
    catch (err) { toast(err.message, "error"); t.checked = !t.checked; }
  }));
  $$("[data-del]", content).forEach((b) => b.addEventListener("click", async () => {
    const c = res.items.find((x) => x.id === Number(b.dataset.del));
    if (!(await confirmDialog({ title: "Kursu sil", message: `<b>${esc(c.name)}</b> kursu silinsin?`, confirmText: "Sil", danger: true }))) return;
    try { await api(`/api/courses/${c.id}`, { method: "DELETE" }); toast("Kurs silindi"); reload(); } catch (err) { toast(err.message, "error"); }
  }));
}

function openCourseForm(course, after) {
  const c = course || { is_active: 1 };
  const m = openModal({
    title: course ? "Kursu redaktə et" : "Yeni kurs",
    body: `<form id="courseForm" novalidate><div class="form-grid">
      ${field("name", "Kurs adı", `<input class="input" name="name" maxlength="120" value="${esc(c.name || "")}" placeholder="Məs. Python proqramlaşdırma">`, { required: true, full: true })}
      ${field("price", "Qiymət (₼)", `<input class="input" name="price" type="number" min="0" step="0.01" value="${c.price ?? ""}">`, { required: true })}
      ${field("duration", "Müddət", `<input class="input" name="duration" maxlength="60" value="${esc(c.duration || "")}" placeholder="Məs. 4 ay">`)}
      ${field("description", "Təsvir", `<textarea class="textarea" name="description" maxlength="2000" placeholder="Qeydiyyat səhifəsində göstərilir">${esc(c.description || "")}</textarea>`, { full: true })}
      <div class="full"><label class="switch"><input type="checkbox" name="is_active" ${c.is_active ? "checked" : ""}><span class="track"></span> Aktiv (qeydiyyatda göstərilsin)</label></div>
    </div><div class="form-error"></div></form>`,
    foot: `<button class="btn btn-outline" data-close>Ləğv et</button><button class="btn btn-primary" id="saveCourse">${icon("check")} Yadda saxla</button>`,
  });
  const form = $("#courseForm", m);
  const save = async (e) => {
    if (e) e.preventDefault();
    if (!requireFields(form, [["name", "Kurs adını daxil edin."], ["price", "Qiyməti daxil edin."]])) return;
    const d = formData(form);
    const body = { name: d.name, price: Number(d.price), duration: d.duration || null, description: d.description || null, is_active: d.is_active };
    const btn = $("#saveCourse", m);
    setBusy(btn, true, "Saxlanılır…");
    try {
      await api(course ? `/api/courses/${course.id}` : "/api/courses", { method: course ? "PUT" : "POST", body });
      toast(course ? "Kurs yeniləndi" : "Kurs əlavə edildi");
      m.close();
      after();
    } catch (err) { showFormError(form, err); setBusy(btn, false); }
  };
  form.addEventListener("submit", save);
  $("#saveCourse", m).addEventListener("click", save);
}

/* =====================================================================
   GROUPS
   ===================================================================== */

const groupState = { course_id: "", active: "" };

async function renderGroups(content, id) {
  const { courses } = await loadLookups(true);
  if (isStale(id)) return;
  const st = groupState;
  content.innerHTML = `
    <div class="toolbar">
      <div class="tabs">${[["", "Hamısı"], ["true", "Aktiv"], ["false", "Deaktiv"]].map(([v, l]) => `<button class="tab ${st.active === v ? "active" : ""}" data-active="${v}">${l}</button>`).join("")}</div>
      <select class="select" id="gCourse">${options(courses, st.course_id, { empty: "Bütün kurslar" })}</select>
      <span class="grow"></span>
      <button class="btn btn-primary" id="addGroup">${icon("plus")} Yeni qrup</button>
    </div>
    <div id="groupArea">${loadingHtml()}</div>`;

  const load = async () => {
    const params = new URLSearchParams();
    if (st.course_id) params.set("course_id", st.course_id);
    if (st.active) params.set("active", st.active);
    const res = await api(`/api/groups?${params}`);
    if (isStale(id)) return;
    const area = $("#groupArea", content);
    if (!res.items.length) {
      area.innerHTML = `<section class="panel">${courses.length
        ? emptyHtml("Qrup tapılmadı", "Yeni qrup yaradın və tələbələri qrupa bağlayın.", `<button class="btn btn-primary btn-sm" data-add>${icon("plus", "icon-sm")} Qrup yarat</button>`, "groups")
        : emptyHtml("Əvvəlcə kurs əlavə edin", "Qrup yaratmaq üçün ən azı bir kurs lazımdır.", `<a class="btn btn-primary btn-sm" href="#/courses">${icon("book", "icon-sm")} Kurslara keç</a>`, "book")}</section>`;
      const add = $("[data-add]", area); if (add) add.addEventListener("click", () => openGroupForm(null, load));
      return;
    }
    area.innerHTML = `<div class="group-grid">${res.items.map((g) => {
      const pct = g.capacity ? Math.min(100, Math.round((g.students_count / g.capacity) * 100)) : 0;
      return `<article class="panel group-card">
        <div class="gc-head"><div><span class="gc-course">${esc(g.course_name || "—")}</span><h4>${esc(g.name)}</h4></div>${activeBadge(g.is_active)}</div>
        <div class="gc-body">
          ${daysChips(g.days_list)}
          <div class="gc-row">${icon("clock")}${esc(timeRange(g.start_time, g.end_time) || "Saat təyin edilməyib")}</div>
          <div class="gc-row">${icon("user")}${esc(g.teacher_name || "Müəllim təyin edilməyib")}</div>
          ${g.start_date ? `<div class="gc-row">${icon("calendar")}Başlama: ${esc(formatDate(g.start_date))}</div>` : ""}
          <div class="gc-row">${icon("students")}<b>${g.students_count}</b>${g.capacity ? ` / ${g.capacity} tələbə` : " tələbə"}</div>
          ${g.capacity ? `<div class="meter ${pct >= 100 ? "full" : ""}" title="${pct}% dolu"><span style="width:${pct}%"></span></div>` : ""}
        </div>
        <div class="gc-foot">
          <div class="links">
            ${g.whatsapp_link ? `<a class="link-pill wa" href="${esc(g.whatsapp_link)}" target="_blank" rel="noopener" title="WhatsApp qrupu">${icon("message")}</a>` : ""}
            ${g.telegram_link ? `<a class="link-pill tg" href="${esc(g.telegram_link)}" target="_blank" rel="noopener" title="Telegram qrupu">${icon("send")}</a>` : ""}
          </div>
          <button class="btn btn-outline btn-sm" data-members="${g.id}">${icon("students", "icon-sm")} Tələbələr</button>
          <button class="btn btn-ghost btn-icon" data-edit="${g.id}" title="Redaktə">${icon("edit")}</button>
          <button class="btn btn-ghost btn-icon" data-del="${g.id}" title="Sil">${icon("trash")}</button>
        </div></article>`;
    }).join("")}</div>`;
    $$("[data-edit]", area).forEach((b) => b.addEventListener("click", () => openGroupForm(res.items.find((g) => g.id === Number(b.dataset.edit)), load)));
    $$("[data-members]", area).forEach((b) => b.addEventListener("click", () => openGroupMembers(Number(b.dataset.members), load)));
    $$("[data-del]", area).forEach((b) => b.addEventListener("click", async () => {
      const g = res.items.find((x) => x.id === Number(b.dataset.del));
      const ok = await confirmDialog({ title: "Qrupu sil", message: `<b>${esc(g.name)}</b> qrupu silinsin? Qrupdakı ${g.students_count} tələbə qrupsuz qalacaq.`, confirmText: "Sil", danger: true });
      if (!ok) return;
      try { await api(`/api/groups/${g.id}`, { method: "DELETE" }); toast("Qrup silindi"); App.lookupsLoaded = false; load(); } catch (err) { toast(err.message, "error"); }
    }));
  };

  $$("[data-active]", content).forEach((t) => t.addEventListener("click", () => {
    st.active = t.dataset.active;
    $$("[data-active]", content).forEach((x) => x.classList.toggle("active", x === t));
    load();
  }));
  $("#gCourse", content).addEventListener("change", (e) => { st.course_id = e.target.value; load(); });
  $("#addGroup", content).addEventListener("click", () => {
    if (!courses.length) { toast("Əvvəlcə kurs əlavə edin", "error"); return; }
    openGroupForm(null, load);
  });
  await load();
}

async function openGroupForm(group, after) {
  const { courses, teachers } = await loadLookups();
  const g = group || { is_active: 1, days_list: [], course_id: groupState.course_id };
  const m = openModal({
    title: group ? "Qrupu redaktə et" : "Yeni qrup",
    size: "lg",
    body: `<form id="groupForm" novalidate><div class="form-grid">
      ${field("name", "Qrup adı", `<input class="input" name="name" maxlength="80" value="${esc(g.name || "")}" placeholder="Məs. PY-01 (axşam)">`, { required: true })}
      ${field("course_id", "Kurs", `<select class="select" name="course_id">${options(courses, g.course_id, { empty: "Kurs seçin" })}</select>`, { required: true })}
      ${field("teacher_id", "Müəllim", `<select class="select" name="teacher_id">${options(teachers.filter((t) => t.status === "Aktiv" || t.id === g.teacher_id), g.teacher_id, { empty: "Təyin edilməyib", label: "full_name" })}</select>`)}
      ${field("capacity", "Tutum (maks. tələbə)", `<input class="input" name="capacity" type="number" min="1" max="1000" value="${g.capacity ?? ""}" placeholder="Limitsiz">`)}
      ${field("days", "Dərs günləri", `<div class="day-picker">${Object.entries(WEEK_DAYS).map(([n, name]) => `<label><input type="checkbox" name="days" data-multi="1" value="${n}" ${(g.days_list || []).includes(Number(n)) ? "checked" : ""}><span title="${name}">${name}</span></label>`).join("")}</div>`, { full: true })}
      ${field("start_time", "Başlama saatı", `<input class="input" name="start_time" type="time" value="${esc(g.start_time || "")}">`)}
      ${field("end_time", "Bitmə saatı", `<input class="input" name="end_time" type="time" value="${esc(g.end_time || "")}">`)}
      ${field("start_date", "Başlama tarixi", `<input class="input" name="start_date" type="date" value="${esc(g.start_date || "")}">`)}
      <div></div>
      ${field("whatsapp_link", "WhatsApp qrup linki", `<input class="input" name="whatsapp_link" value="${esc(g.whatsapp_link || "")}" placeholder="https://chat.whatsapp.com/…">`)}
      ${field("telegram_link", "Telegram qrup linki", `<input class="input" name="telegram_link" value="${esc(g.telegram_link || "")}" placeholder="https://t.me/…">`)}
      <div class="full"><label class="switch"><input type="checkbox" name="is_active" ${g.is_active ? "checked" : ""}><span class="track"></span> Aktiv (qeydiyyatda seçilə bilsin)</label></div>
    </div><div class="form-error"></div></form>`,
    foot: `<button class="btn btn-outline" data-close>Ləğv et</button><button class="btn btn-primary" id="saveGroup">${icon("check")} Yadda saxla</button>`,
  });
  const form = $("#groupForm", m);
  const save = async (e) => {
    if (e) e.preventDefault();
    if (!requireFields(form, [["name", "Qrup adını daxil edin."], ["course_id", "Kurs seçin."]])) return;
    const d = formData(form);
    const body = {
      name: d.name, course_id: Number(d.course_id), teacher_id: d.teacher_id ? Number(d.teacher_id) : null,
      days: $$("[name=days]:checked", form).map((c) => Number(c.value)),
      start_time: d.start_time || null, end_time: d.end_time || null, start_date: d.start_date || null,
      capacity: d.capacity ? Number(d.capacity) : null,
      whatsapp_link: d.whatsapp_link || null, telegram_link: d.telegram_link || null, is_active: d.is_active,
    };
    const btn = $("#saveGroup", m);
    setBusy(btn, true, "Saxlanılır…");
    try {
      await api(group ? `/api/groups/${group.id}` : "/api/groups", { method: group ? "PUT" : "POST", body });
      toast(group ? "Qrup yeniləndi" : "Qrup yaradıldı");
      App.lookupsLoaded = false;
      m.close();
      after();
    } catch (err) { showFormError(form, err); setBusy(btn, false); }
  };
  form.addEventListener("submit", save);
  $("#saveGroup", m).addEventListener("click", save);
}

async function openGroupMembers(groupId, after) {
  let group, all;
  try {
    [group, all] = await Promise.all([api(`/api/groups/${groupId}`), api("/api/students?page_size=200")]);
  } catch (err) { toast(err.message, "error"); return; }
  const candidates = all.items.filter((s) => s.group_id !== groupId && s.status !== "Deaktiv" && (!s.course_id || s.course_id === group.course_id));

  const m = openModal({
    title: `${esc(group.name)} — tələbələr`,
    sub: `${esc(group.course_name)} · ${group.students.length}${group.capacity ? " / " + group.capacity : ""} tələbə`,
    size: "lg",
    body: `
      <div class="section-title" style="margin-top:4px">Qrupdakı tələbələr</div>
      ${group.students.length ? `<div class="check-list">${group.students.map((s) => `
        <div class="check-row" style="cursor:default"><div class="avatar soft">${esc(initials(s.first_name + " " + s.last_name))}</div>
          <div style="flex:1;min-width:0"><b>${esc(s.first_name)} ${esc(s.last_name)}</b><span class="sub">${esc(formatPhone(s.phone))}</span></div>
          ${studentBadge(s.status)}
          <button class="btn btn-ghost btn-sm" data-remove="${s.id}">${icon("x", "icon-sm")} Çıxar</button></div>`).join("")}</div>`
        : `<div class="empty" style="padding:24px">Qrupda hələ tələbə yoxdur</div>`}
      <div class="section-title">Qrupa tələbə əlavə et</div>
      ${candidates.length ? `<label class="search-box" style="max-width:none;margin-bottom:10px">${icon("search")}<input class="input" id="memberSearch" placeholder="Axtar…"></label>
        <div class="check-list" id="candList">${candidates.map((s) => `
          <label class="check-row" data-text="${esc((s.full_name + " " + s.phone).toLowerCase())}"><input type="checkbox" value="${s.id}">
            <div style="flex:1;min-width:0"><b>${esc(s.full_name)}</b><span class="sub">${esc(s.code)} · ${esc(s.group_name ? "Hazırda: " + s.group_name : "Qrupsuz")}</span></div>
            ${studentBadge(s.status)}</label>`).join("")}</div>`
        : `<div class="empty" style="padding:24px">Bu kursa aid qrupsuz tələbə yoxdur</div>`}
      <div class="form-error"></div>`,
    foot: `<button class="btn btn-outline" data-close>Bağla</button>${candidates.length ? `<button class="btn btn-primary" id="assignBtn" disabled>${icon("plus")} Seçilənləri əlavə et</button>` : ""}`,
  });

  const refresh = () => { m.close(); after(); openGroupMembers(groupId, after); };
  $$("[data-remove]", m).forEach((b) => b.addEventListener("click", async () => {
    try { await api(`/api/groups/${groupId}/students/${b.dataset.remove}`, { method: "DELETE" }); toast("Tələbə qrupdan çıxarıldı"); refresh(); }
    catch (err) { toast(err.message, "error"); }
  }));
  const btn = $("#assignBtn", m);
  if (btn) {
    const updateBtn = () => {
      const n = $$("#candList input:checked", m).length;
      btn.disabled = !n;
      btn.innerHTML = `${icon("plus")} ${n ? `${n} tələbəni əlavə et` : "Seçilənləri əlavə et"}`;
    };
    $("#candList", m).addEventListener("change", updateBtn);
    $("#memberSearch", m).addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      $$("#candList .check-row", m).forEach((r) => { r.style.display = r.dataset.text.includes(q) ? "" : "none"; });
    });
    btn.addEventListener("click", async () => {
      const ids = $$("#candList input:checked", m).map((c) => Number(c.value));
      setBusy(btn, true, "Əlavə edilir…");
      try { const r = await api(`/api/groups/${groupId}/students`, { method: "POST", body: { student_ids: ids } }); toast(r.message); refresh(); }
      catch (err) { showFormError($(".modal-body", m), err); setBusy(btn, false); }
    });
  }
}

/* =====================================================================
   TEACHERS
   ===================================================================== */

async function renderTeachers(content, id) {
  const res = await api("/api/teachers");
  if (isStale(id)) return;
  content.innerHTML = `
    <div class="toolbar">
      <label class="search-box">${icon("search")}<input class="input" id="tq" placeholder="Ad, telefon, fənn…"></label>
      <span class="grow"></span>
      <button class="btn btn-primary" id="addTeacher">${icon("plus")} Yeni müəllim</button>
    </div>
    <section class="panel" id="teacherArea"></section>`;

  const reload = () => { App.lookupsLoaded = false; route(); };
  const draw = (items) => {
    const area = $("#teacherArea", content);
    if (!items.length) {
      area.innerHTML = res.items.length ? emptyHtml("Nəticə tapılmadı", "", "", "search")
        : emptyHtml("Hələ müəllim yoxdur", "Müəllimləri əlavə edib qruplara təyin edin.", `<button class="btn btn-primary btn-sm" data-add>${icon("plus", "icon-sm")} Müəllim əlavə et</button>`, "teacher");
      const add = $("[data-add]", area); if (add) add.addEventListener("click", () => openTeacherForm(null, reload));
      return;
    }
    area.innerHTML = `<div class="table-wrap"><table class="table stack">
      <thead><tr><th>Müəllim</th><th>Telefon</th><th>Fənn / kurs</th><th>Qruplar</th><th>Status</th><th></th></tr></thead>
      <tbody>${items.map((t) => `<tr>
        <td><div class="cell-main"><div class="avatar soft">${esc(initials(t.full_name))}</div><b>${esc(t.full_name)}</b></div></td>
        <td class="nowrap" data-label="Telefon">${t.phone ? `<a href="tel:${esc(t.phone)}">${esc(formatPhone(t.phone))}</a>` : "—"}</td>
        <td data-label="Fənn / kurs"><div><b style="font-weight:600">${esc(t.subject || "—")}</b><span class="sub">${esc(t.course_name || "")}</span></div></td>
        <td data-label="Qruplar">${t.groups_count ? `<span style="white-space:normal">${esc(t.group_names)}</span>` : `<span class="sub">Qrup yoxdur</span>`}</td>
        <td data-label="Status">${t.status === "Aktiv" ? '<span class="badge badge-green">Aktiv</span>' : '<span class="badge badge-gray">Deaktiv</span>'}</td>
        <td class="actions"><button class="btn btn-ghost btn-icon" data-edit="${t.id}" title="Redaktə">${icon("edit")}</button>
          <button class="btn btn-ghost btn-icon" data-del="${t.id}" title="Sil">${icon("trash")}</button></td>
      </tr>`).join("")}</tbody></table></div>`;
    $$("[data-edit]", area).forEach((b) => b.addEventListener("click", () => openTeacherForm(res.items.find((t) => t.id === Number(b.dataset.edit)), reload)));
    $$("[data-del]", area).forEach((b) => b.addEventListener("click", async () => {
      const t = res.items.find((x) => x.id === Number(b.dataset.del));
      if (!(await confirmDialog({ title: "Müəllimi sil", message: `<b>${esc(t.full_name)}</b> silinsin? Bağlı qruplardan müəllim çıxarılacaq.`, confirmText: "Sil", danger: true }))) return;
      try { await api(`/api/teachers/${t.id}`, { method: "DELETE" }); toast("Müəllim silindi"); reload(); } catch (err) { toast(err.message, "error"); }
    }));
  };
  draw(res.items);
  $("#tq", content).addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    draw(res.items.filter((t) => `${t.full_name} ${t.phone || ""} ${t.subject || ""} ${t.course_name || ""} ${t.group_names || ""}`.toLowerCase().includes(q)));
  });
  $("#addTeacher", content).addEventListener("click", () => openTeacherForm(null, reload));
}

async function openTeacherForm(teacher, after) {
  const { courses } = await loadLookups();
  const t = teacher || { status: "Aktiv" };
  const m = openModal({
    title: teacher ? "Müəllimi redaktə et" : "Yeni müəllim",
    body: `<form id="teacherForm" novalidate><div class="form-grid">
      ${field("full_name", "Ad Soyad", `<input class="input" name="full_name" maxlength="120" value="${esc(t.full_name || "")}">`, { required: true, full: true })}
      ${field("phone", "Telefon", `<input class="input" name="phone" type="tel" placeholder="+994 50 123 45 67" value="${esc(formatPhone(t.phone || ""))}">`)}
      ${field("subject", "Fənn", `<input class="input" name="subject" maxlength="120" value="${esc(t.subject || "")}" placeholder="Məs. Python, UI/UX">`)}
      ${field("course_id", "Kurs", `<select class="select" name="course_id">${options(courses, t.course_id, { empty: "Seçilməyib" })}</select>`)}
      ${field("status", "Status", `<select class="select" name="status">${options(["Aktiv", "Deaktiv"], t.status)}</select>`)}
    </div><div class="form-error"></div></form>`,
    foot: `<button class="btn btn-outline" data-close>Ləğv et</button><button class="btn btn-primary" id="saveTeacher">${icon("check")} Yadda saxla</button>`,
  });
  const form = $("#teacherForm", m);
  const save = async (e) => {
    if (e) e.preventDefault();
    if (!requireFields(form, [["full_name", "Ad Soyad daxil edin."]])) return;
    const d = formData(form);
    const body = { full_name: d.full_name, phone: d.phone || null, subject: d.subject || null, course_id: d.course_id ? Number(d.course_id) : null, status: d.status };
    const btn = $("#saveTeacher", m);
    setBusy(btn, true, "Saxlanılır…");
    try {
      await api(teacher ? `/api/teachers/${teacher.id}` : "/api/teachers", { method: teacher ? "PUT" : "POST", body });
      toast(teacher ? "Müəllim yeniləndi" : "Müəllim əlavə edildi");
      m.close();
      after();
    } catch (err) { showFormError(form, err); setBusy(btn, false); }
  };
  form.addEventListener("submit", save);
  $("#saveTeacher", m).addEventListener("click", save);
}

/* =====================================================================
   CARDS
   ===================================================================== */

async function renderCards(content, id) {
  const res = await api("/api/cards");
  if (isStale(id)) return;
  const active = res.items.filter((c) => c.is_active).length;
  content.innerHTML = `
    <div class="toolbar">
      <div class="alert alert-info" style="flex:1 1 320px">${icon("info")}<span>Aktiv kartlar (${active}) qeydiyyat səhifəsinin ödəniş mərhələsində tələbələrə göstərilir.</span></div>
      <button class="btn btn-primary" id="addCard">${icon("plus")} Kart əlavə et</button>
    </div>
    ${res.items.length ? `<div class="bank-grid">${res.items.map((c) => `
      <article class="bank-tile ${c.is_active ? "" : "inactive"}">
        <div class="bank-face">
          <div class="top"><span>${esc(c.bank_name)}</span><span class="chip"></span></div>
          <div class="number">${esc(c.card_number_formatted)}</div>
          <div class="holder">${esc(c.card_holder)}${c.qr_code_url ? ' <span class="qr-tag">QR</span>' : ""}</div>
        </div>
        <div class="bank-meta">
          <label class="switch"><input type="checkbox" data-toggle="${c.id}" ${c.is_active ? "checked" : ""}><span class="track"></span><span class="sub">${c.is_active ? "Aktiv" : "Deaktiv"}</span></label>
          <span class="stats">${c.payments_count} ödəniş · ${money(c.approved_total)}</span>
          <span><button class="btn btn-ghost btn-icon" data-edit="${c.id}" title="Redaktə">${icon("edit")}</button>
            <button class="btn btn-ghost btn-icon" data-del="${c.id}" title="Sil">${icon("trash")}</button></span>
        </div>
      </article>`).join("")}</div>`
    : `<section class="panel">${emptyHtml("Hələ kart əlavə edilməyib", "Tələbələrin ödəniş edə bilməsi üçün ən azı bir aktiv kart əlavə edin.", `<button class="btn btn-primary btn-sm" data-add>${icon("plus", "icon-sm")} Kart əlavə et</button>`, "card")}</section>`}`;

  const reload = () => { App.lookupsLoaded = false; route(); };
  $("#addCard", content).addEventListener("click", () => openCardForm(null, reload));
  const add = $("[data-add]", content); if (add) add.addEventListener("click", () => openCardForm(null, reload));
  $$("[data-edit]", content).forEach((b) => b.addEventListener("click", () => openCardForm(res.items.find((c) => c.id === Number(b.dataset.edit)), reload)));
  $$("[data-toggle]", content).forEach((t) => t.addEventListener("change", async () => {
    try { await api(`/api/cards/${t.dataset.toggle}`, { method: "PUT", body: { is_active: t.checked } }); toast(t.checked ? "Kart aktiv edildi" : "Kart deaktiv edildi"); reload(); }
    catch (err) { toast(err.message, "error"); t.checked = !t.checked; }
  }));
  $$("[data-del]", content).forEach((b) => b.addEventListener("click", async () => {
    const c = res.items.find((x) => x.id === Number(b.dataset.del));
    const ok = await confirmDialog({ title: "Kartı sil", message: `<b>${esc(c.bank_name)} ${esc(c.card_number_formatted)}</b> silinsin? Keçmiş ödənişlərdə kart məlumatı qorunur. Müvəqqəti gizlətmək üçün deaktiv etmək kifayətdir.`, confirmText: "Sil", danger: true });
    if (!ok) return;
    try { await api(`/api/cards/${c.id}`, { method: "DELETE" }); toast("Kart silindi"); reload(); } catch (err) { toast(err.message, "error"); }
  }));
}

function openCardForm(cardItem, after) {
  const c = cardItem || { is_active: 1 };
  const m = openModal({
    title: cardItem ? "Kartı redaktə et" : "Yeni ödəniş kartı",
    body: `<form id="cardForm" novalidate><div class="form-grid">
      ${field("bank_name", "Bank adı", `<input class="input" name="bank_name" maxlength="80" value="${esc(c.bank_name || "")}" placeholder="Məs. Kapital Bank">`, { required: true })}
      ${field("card_holder", "Kart sahibi", `<input class="input" name="card_holder" maxlength="120" value="${esc(c.card_holder || "")}" placeholder="Ad Soyad">`, { required: true })}
      ${field("card_number", "Kart nömrəsi", `<input class="input" name="card_number" inputmode="numeric" maxlength="23" value="${esc(formatCard(c.card_number || ""))}" placeholder="0000 0000 0000 0000" style="letter-spacing:.06em">`, { required: true, full: true, hint: "CVV, PIN və son istifadə tarixi heç vaxt daxil edilməməlidir." })}
      ${field("qr_code_url", "QR kod şəklinin linki (istəyə görə)", `<input class="input" name="qr_code_url" maxlength="500" value="${esc(c.qr_code_url || "")}" placeholder="https://…/qr.png">`, { hint: "Doldurulsa, qeydiyyatda “QR kodu göstər” düyməsi çıxır." })}
      ${field("sort_order", "Sıra", `<input class="input" name="sort_order" type="number" min="0" max="1000" value="${c.sort_order ?? 0}">`, { hint: "Kiçik rəqəm əvvəl göstərilir." })}
      <div class="full"><label class="switch"><input type="checkbox" name="is_active" ${c.is_active ? "checked" : ""}><span class="track"></span> Aktiv (qeydiyyatda göstərilsin)</label></div>
    </div><div class="form-error"></div></form>`,
    foot: `<button class="btn btn-outline" data-close>Ləğv et</button><button class="btn btn-primary" id="saveCard">${icon("check")} Yadda saxla</button>`,
  });
  const form = $("#cardForm", m);
  const num = $("[name=card_number]", form);
  num.addEventListener("input", () => { num.value = formatCard(num.value).slice(0, 23); });
  const save = async (e) => {
    if (e) e.preventDefault();
    if (!requireFields(form, [["bank_name", "Bank adını daxil edin."], ["card_holder", "Kart sahibini daxil edin."], ["card_number", "Kart nömrəsini daxil edin."]])) return;
    const d = formData(form);
    const body = {
      bank_name: d.bank_name, card_holder: d.card_holder, card_number: d.card_number.replace(/\D/g, ""),
      qr_code_url: d.qr_code_url || null, sort_order: Number(d.sort_order || 0), is_active: d.is_active,
    };
    const btn = $("#saveCard", m);
    setBusy(btn, true, "Saxlanılır…");
    try {
      await api(cardItem ? `/api/cards/${cardItem.id}` : "/api/cards", { method: cardItem ? "PUT" : "POST", body });
      toast(cardItem ? "Kart yeniləndi" : "Kart əlavə edildi");
      m.close();
      after();
    } catch (err) { showFormError(form, err); setBusy(btn, false); }
  };
  form.addEventListener("submit", save);
  $("#saveCard", m).addEventListener("click", save);
}

/* =====================================================================
   REPORTS
   ===================================================================== */

const reportState = { from: "", to: "", preset: "all", metric: "revenue" };

function presetRange(preset) {
  const now = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (preset === "month") return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(now)];
  if (preset === "3m") return [iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)), iso(now)];
  if (preset === "year") return [iso(new Date(now.getFullYear(), 0, 1)), iso(now)];
  return ["", ""];
}

async function renderReports(content, id) {
  const st = reportState;
  const params = new URLSearchParams();
  if (st.from) params.set("date_from", st.from);
  if (st.to) params.set("date_to", st.to);
  const r = await api(`/api/reports?${params}`);
  if (isStale(id)) return;
  const s = r.summary;

  const METRICS = { revenue: "Təsdiqlənmiş gəlir", expenses: "Xərclər", registrations: "Qeydiyyatlar" };
  const metricLabel = METRICS[st.metric];
  const values = r.monthly.map((x) => x[st.metric]);
  const max = Math.max(...values, 0);
  const fmt = (v) => (st.metric === "registrations" ? `${v} qeydiyyat` : money(v));
  const monthName = (m) => { const [y, mo] = m.split("-").map(Number); return { short: MONTHS[mo - 1], full: `${MONTHS_FULL[mo - 1]} ${y}` }; };

  content.innerHTML = `
    <div class="toolbar">
      <div class="tabs">${[["all", "Bütün dövr"], ["month", "Bu ay"], ["3m", "Son 3 ay"], ["year", "Bu il"], ["custom", "Seçilmiş"]].map(([k, l]) => `<button class="tab ${st.preset === k ? "active" : ""}" data-preset="${k}">${l}</button>`).join("")}</div>
      <input class="input" type="date" id="rFrom" value="${esc(st.from)}" style="width:auto" aria-label="Başlanğıc tarix">
      <input class="input" type="date" id="rTo" value="${esc(st.to)}" style="width:auto" aria-label="Son tarix">
      <span class="grow"></span>
      <button class="btn btn-outline" data-export="students">${icon("download")} Tələbələr CSV</button>
      <button class="btn btn-outline" data-export="payments">${icon("download")} Ödənişlər CSV</button>
      <button class="btn btn-outline" data-export="expenses">${icon("download")} Xərclər CSV</button>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="kpi-top"><span>Qeydiyyatlar</span><span class="kpi-icon navy">${icon("students")}</span></div><div class="kpi-value">${s.registrations}</div><div class="kpi-sub">Seçilmiş dövrdə</div></div>
      <div class="kpi"><div class="kpi-top"><span>Təsdiqlənmiş gəlir</span><span class="kpi-icon green">${icon("trend")}</span></div><div class="kpi-value">${money(s.approved_amount)}</div><div class="kpi-sub">${s.approved_count} ödəniş</div></div>
      <div class="kpi"><div class="kpi-top"><span>Gözləyən məbləğ</span><span class="kpi-icon amber">${icon("hourglass")}</span></div><div class="kpi-value">${money(s.pending_amount)}</div><div class="kpi-sub">${s.pending_count} ödəniş</div></div>
      <div class="kpi"><div class="kpi-top"><span>Xərclər</span><span class="kpi-icon navy">${icon("receipt")}</span></div><div class="kpi-value">${money(s.expenses_amount)}</div><div class="kpi-sub">Seçilmiş dövrdə</div></div>
      <div class="kpi"><div class="kpi-top"><span>Xalis balans</span><span class="kpi-icon ${s.net_amount >= 0 ? "green" : "amber"}">${icon("wallet")}</span></div><div class="kpi-value">${money(s.net_amount)}</div><div class="kpi-sub">Gəlir − xərc</div></div>
      <div class="kpi"><div class="kpi-top"><span>Ümumi borc</span><span class="kpi-icon amber">${icon("debt")}</span></div><div class="kpi-value">${money(s.debt_total)}</div><div class="kpi-sub">${s.debtors_count} borclu tələbə</div></div>
      <div class="kpi"><div class="kpi-top"><span>Rədd edilmiş</span><span class="kpi-icon">${icon("x")}</span></div><div class="kpi-value">${s.rejected_count}</div><div class="kpi-sub">ödəniş</div></div>
    </div>

    <section class="panel" style="margin-bottom:20px">
      <div class="panel-head"><div><h3>${metricLabel} — son 12 ay</h3><p>Ən yüksək ay: ${fmt(max)}</p></div>
        <div class="tabs">${[["revenue", "Gəlir"], ["expenses", "Xərc"], ["registrations", "Qeydiyyat"]].map(([k, l]) => `<button class="tab ${st.metric === k ? "active" : ""}" data-metric="${k}">${l}</button>`).join("")}</div></div>
      <div class="panel-body">
        ${max ? `<div class="bars" role="img" aria-label="${metricLabel} aylar üzrə">${r.monthly.map((x, i) => {
          const v = values[i];
          const h = max ? Math.max((v / max) * 100, v ? 2 : 0) : 0;
          return `<div class="bar-col" tabindex="0"><span class="tip">${monthName(x.month).full}: <b>${fmt(v)}</b></span><div class="bar" style="height:${h}%"></div></div>`;
        }).join("")}</div>
        <div class="bar-labels">${r.monthly.map((x) => `<span>${monthName(x.month).short}</span>`).join("")}</div>
        <details style="margin-top:14px"><summary class="sub" style="cursor:pointer">Cədvəl kimi göstər</summary>
          <div class="table-wrap" style="margin-top:8px"><table class="table"><thead><tr><th>Ay</th><th class="num">Qeydiyyat</th><th class="num">Gəlir</th><th class="num">Xərc</th><th class="num">Balans</th></tr></thead>
          <tbody>${r.monthly.map((x) => `<tr><td>${monthName(x.month).full}</td><td class="num">${x.registrations}</td><td class="num">${money(x.revenue)}</td><td class="num">${money(x.expenses)}</td><td class="num">${money(x.revenue - x.expenses)}</td></tr>`).join("")}</tbody></table></div></details>`
        : emptyHtml("Hələ məlumat yoxdur", "Təsdiqlənmiş ödəniş və qeydiyyatlar yarandıqca qrafik dolacaq.", "", "chart")}
      </div>
    </section>

    <div class="grid-2" style="margin-bottom:20px">
      <section class="panel"><div class="panel-head"><div><h3>Kurslar üzrə</h3><p>Seçilmiş dövr</p></div></div>
        ${r.by_course.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Kurs</th><th class="num">Qeydiyyat</th><th class="num">Aktiv</th><th class="num">Gəlir</th><th class="num">Gözləyir</th></tr></thead>
        <tbody>${r.by_course.map((c) => `<tr><td><b style="font-weight:600">${esc(c.name)}</b>${c.is_active ? "" : '<span class="sub">Deaktiv</span>'}</td><td class="num">${c.registrations}</td><td class="num">${c.active_students}</td><td class="num"><b>${money(c.approved_amount)}</b></td><td class="num">${money(c.pending_amount)}</td></tr>`).join("")}</tbody></table></div>`
        : emptyHtml("Kurs yoxdur", "", "", "book")}
      </section>
      <section class="panel"><div class="panel-head"><div><h3>Qrupların doluluğu</h3><p>Deaktiv tələbələr nəzərə alınmır</p></div></div>
        ${r.by_group.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Qrup</th><th>Doluluq</th><th class="num">Tələbə</th></tr></thead>
        <tbody>${r.by_group.map((g) => {
          const pct = g.capacity ? Math.min(100, Math.round((g.students_count / g.capacity) * 100)) : null;
          return `<tr><td><b style="font-weight:600">${esc(g.name)}</b><span class="sub">${esc(g.course_name || "")}${g.teacher_name ? " · " + esc(g.teacher_name) : ""}</span></td>
            <td style="min-width:120px">${pct === null ? '<span class="sub">Limitsiz</span>' : `<div class="meter ${pct >= 100 ? "full" : ""}" title="${pct}%"><span style="width:${pct}%"></span></div><span class="sub">${pct}%</span>`}</td>
            <td class="num">${g.students_count}${g.capacity ? " / " + g.capacity : ""}</td></tr>`;
        }).join("")}</tbody></table></div>`
        : emptyHtml("Qrup yoxdur", "", "", "groups")}
      </section>
    </div>

    <div class="grid-2">
      <section class="panel"><div class="panel-head"><div><h3>Tələbə statusları</h3><p>Cari vəziyyət</p></div></div>
        <div class="table-wrap"><table class="table"><tbody>${r.by_status.map((x) => `<tr><td>${studentBadge(x.status)}</td><td class="num"><b>${x.count}</b></td></tr>`).join("")}</tbody></table></div>
      </section>
      <section class="panel"><div class="panel-head"><div><h3>Xərclər kateqoriya üzrə</h3><p>Seçilmiş dövr</p></div></div>
        ${r.by_expense_category.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Kateqoriya</th><th class="num">Say</th><th class="num">Məbləğ</th></tr></thead>
        <tbody>${r.by_expense_category.map((c) => `<tr><td>${esc(c.category)}</td><td class="num">${c.count}</td><td class="num"><b>${money(c.amount)}</b></td></tr>`).join("")}</tbody></table></div>`
        : emptyHtml("Xərc yoxdur", "", "", "receipt")}
      </section>
      <section class="panel"><div class="panel-head"><div><h3>Kartlar üzrə ödənişlər</h3><p>Seçilmiş dövr</p></div></div>
        ${r.by_card.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Kart</th><th class="num">Ödəniş</th><th class="num">Təsdiqlənmiş</th></tr></thead>
        <tbody>${r.by_card.map((c) => `<tr><td><span style="white-space:normal">${esc(c.card)}</span></td><td class="num">${c.payments}</td><td class="num"><b>${money(c.approved_amount)}</b></td></tr>`).join("")}</tbody></table></div>`
        : emptyHtml("Ödəniş yoxdur", "", "", "card")}
      </section>
    </div>`;

  $$("[data-preset]", content).forEach((b) => b.addEventListener("click", () => {
    st.preset = b.dataset.preset;
    if (st.preset !== "custom") [st.from, st.to] = presetRange(st.preset);
    route();
  }));
  $$("[data-metric]", content).forEach((b) => b.addEventListener("click", () => { st.metric = b.dataset.metric; route(); }));
  ["rFrom", "rTo"].forEach((idName) => $(`#${idName}`, content).addEventListener("change", () => {
    st.from = $("#rFrom", content).value;
    st.to = $("#rTo", content).value;
    st.preset = "custom";
    route();
  }));
  $$("[data-export]", content).forEach((b) => b.addEventListener("click", () => downloadFile(`/api/reports/export/${b.dataset.export}`, { students: "telebeler.csv", payments: "odenisler.csv", expenses: "xercler.csv" }[b.dataset.export])));
}

/* =====================================================================
   ATTENDANCE
   ===================================================================== */

const attState = { group_id: "", date: "" };
const ATT_TONE = { "İştirak etdi": "green", "Gecikdi": "amber", "Qayıb": "red", "Üzrlü": "violet" };

async function renderAttendance(content, id) {
  const { groups } = await loadLookups(true);
  if (isStale(id)) return;
  const active = groups.filter((g) => g.is_active);
  if (!active.length) {
    content.innerHTML = `<section class="panel">${emptyHtml("Aktiv qrup yoxdur", "Davamiyyət qeyd etmək üçün əvvəlcə qrup yaradın və tələbələri qrupa əlavə edin.",
      `<a class="btn btn-primary btn-sm" href="#/groups">${icon("groups", "icon-sm")} Qruplara keç</a>`, "clipboard")}</section>`;
    return;
  }
  if (!active.some((g) => String(g.id) === String(attState.group_id))) attState.group_id = String(active[0].id);
  if (!attState.date) attState.date = todayIso();

  content.innerHTML = `
    <div class="toolbar">
      <select class="select" id="attGroup" style="max-width:320px">${options(active, attState.group_id, { label: (g) => `${g.name} · ${g.course_name}` })}</select>
      <input class="input" type="date" id="attDate" value="${esc(attState.date)}" max="${todayIso()}" style="width:auto" aria-label="Dərs tarixi">
      <span class="grow"></span>
      <button class="btn btn-outline" id="attAll">${icon("check")} Hamısı iştirak etdi</button>
      <button class="btn btn-primary" id="attSave">${icon("check")} Yadda saxla</button>
    </div>
    <div class="att-layout">
      <section class="panel" id="attArea">${loadingHtml()}</section>
      <aside class="panel" id="attHistory"></aside>
    </div>`;

  let data = null;
  const load = async () => {
    try {
      data = await api(`/api/attendance?group_id=${attState.group_id}&lesson_date=${attState.date}`);
    } catch (err) { $("#attArea", content).innerHTML = emptyHtml("Xəta", err.message, "", "alert"); return; }
    if (isStale(id)) return;
    const g = data.group;
    const weekday = ((new Date(attState.date + "T00:00").getDay() + 6) % 7) + 1;
    const lessonDay = (g.days || "").split(",").map(Number).includes(weekday);
    const area = $("#attArea", content);
    area.innerHTML = `
      <div class="panel-head"><div><h3>${esc(g.name)} — ${esc(formatDate(attState.date))}</h3>
        <p>${esc(g.days_label || "Dərs günləri təyin edilməyib")}${g.start_time ? " · " + esc(timeRange(g.start_time, g.end_time)) : ""}</p></div>
        ${data.is_saved ? '<span class="badge badge-green">Yadda saxlanılıb</span>' : '<span class="badge badge-gray">Qeyd edilməyib</span>'}</div>
      ${g.days && !lessonDay ? `<div class="alert alert-warning" style="margin:14px 20px 0">${icon("info")}<span>Seçilmiş tarix bu qrupun dərs günlərinə düşmür.</span></div>` : ""}
      ${data.students.length ? `<div class="att-list">${data.students.map((s) => `
        <div class="att-row" data-sid="${s.id}">
          <div class="cell-main"><div class="avatar soft">${esc(initials(s.full_name))}</div>
            <div><b>${esc(s.full_name)}</b><small>${esc(s.code)} · ${s.rate === null ? "Hələ qeyd yoxdur" : `Davamiyyət: ${s.rate}% (${s.present_lessons}/${s.total_lessons})`}</small></div></div>
          <div class="att-seg" role="radiogroup" aria-label="${esc(s.full_name)}">
            ${ATTENDANCE_STATUSES.map((st) => `<button type="button" class="att-btn ${ATT_TONE[st]} ${s.status === st ? "on" : ""}" data-st="${esc(st)}" aria-pressed="${s.status === st}">${esc(st)}</button>`).join("")}
          </div>
          <input class="input att-note" placeholder="Qeyd" maxlength="300" value="${esc(s.note || "")}">
        </div>`).join("")}</div>`
      : emptyHtml("Qrupda tələbə yoxdur", "Tələbələri qrupa “Qruplar” bölməsindən əlavə edin.", `<a class="btn btn-outline btn-sm" href="#/groups">${icon("groups", "icon-sm")} Qruplara keç</a>`, "students")}`;
    $$(".att-btn", area).forEach((b) => b.addEventListener("click", () => {
      $$(".att-btn", b.parentElement).forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
    }));
    $("#attHistory", content).innerHTML = `
      <div class="panel-head"><div><h3>Son dərslər</h3><p>Qeyd edilmiş tarixlər</p></div></div>
      ${data.history.length ? `<div class="att-history">${data.history.map((h) => `
        <button class="att-hist ${h.lesson_date === attState.date ? "on" : ""}" data-date="${h.lesson_date}">
          <span>${esc(formatDate(h.lesson_date))}</span><span class="sub">${h.present}/${h.marked} iştirak</span></button>`).join("")}</div>`
      : `<div class="empty" style="padding:24px">Hələ qeyd yoxdur</div>`}`;
    $$("[data-date]", content).forEach((b) => b.addEventListener("click", () => {
      attState.date = b.dataset.date;
      $("#attDate", content).value = attState.date;
      load();
    }));
  };

  $("#attGroup", content).addEventListener("change", (e) => { attState.group_id = e.target.value; load(); });
  $("#attDate", content).addEventListener("change", (e) => { if (e.target.value) { attState.date = e.target.value; load(); } });
  $("#attAll", content).addEventListener("click", () => {
    $$(".att-row", content).forEach((row) => $$(".att-btn", row).forEach((b) => { const on = b.dataset.st === "İştirak etdi"; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }));
  });
  $("#attSave", content).addEventListener("click", async () => {
    const rowsEl = $$(".att-row", content);
    if (!rowsEl.length) { toast("Qrupda tələbə yoxdur", "error"); return; }
    const missing = rowsEl.filter((r) => !$(".att-btn.on", r));
    if (missing.length) {
      toast(`${missing.length} tələbə üçün status seçilməyib`, "error");
      missing[0].scrollIntoView({ behavior: "smooth", block: "center" });
      missing.forEach((r) => { r.classList.add("missing"); setTimeout(() => r.classList.remove("missing"), 1600); });
      return;
    }
    const records = rowsEl.map((r) => ({ student_id: Number(r.dataset.sid), status: $(".att-btn.on", r).dataset.st, note: $(".att-note", r).value.trim() || null }));
    const btn = $("#attSave", content);
    setBusy(btn, true, "Saxlanılır…");
    try {
      const res = await api("/api/attendance", { method: "PUT", body: { group_id: Number(attState.group_id), lesson_date: attState.date, records } });
      toast(res.message);
      await load();
    } catch (err) { toast(err.message, "error"); }
    setBusy(btn, false);
  });
  await load();
}

/* =====================================================================
   EXPENSES
   ===================================================================== */

const expState = { q: "", category: "", from: "", to: "", page: 1 };

async function renderExpenses(content, id) {
  const st = expState;
  content.innerHTML = `
    <div class="grid-3" id="expSummary" style="margin-bottom:18px"></div>
    <div class="toolbar">
      <label class="search-box">${icon("search")}<input class="input" id="eq" placeholder="Xərc adı, qeyd…" value="${esc(st.q)}"></label>
      <select class="select" id="eCat">${options(EXPENSE_CATEGORIES, st.category, { empty: "Bütün kateqoriyalar" })}</select>
      <input class="input" type="date" id="eFrom" value="${esc(st.from)}" style="width:auto" aria-label="Başlanğıc tarix">
      <input class="input" type="date" id="eTo" value="${esc(st.to)}" style="width:auto" aria-label="Son tarix">
      <span class="grow"></span>
      <button class="btn btn-outline" id="expExport">${icon("download")} CSV</button>
      <button class="btn btn-primary" id="addExp">${icon("plus")} Xərc əlavə et</button>
    </div>
    <section class="panel" id="expArea">${loadingHtml()}</section>`;

  const load = async () => {
    const params = new URLSearchParams({ page: st.page, page_size: 20 });
    if (st.q) params.set("q", st.q);
    if (st.category) params.set("category", st.category);
    if (st.from) params.set("date_from", st.from);
    if (st.to) params.set("date_to", st.to);
    let res;
    try { res = await api(`/api/expenses?${params}`); } catch (err) { $("#expArea", content).innerHTML = emptyHtml("Xəta", err.message, "", "alert"); return; }
    if (isStale(id)) return;
    const top = res.by_category[0];
    $("#expSummary", content).innerHTML = `
      <div class="kpi"><div class="kpi-top"><span>Bu ay xərclər</span><span class="kpi-icon navy">${icon("calendar")}</span></div><div class="kpi-value">${money(res.month_total)}</div><div class="kpi-sub">${MONTHS_FULL[new Date().getMonth()]} ${new Date().getFullYear()}</div></div>
      <div class="kpi"><div class="kpi-top"><span>Filtr üzrə cəmi</span><span class="kpi-icon">${icon("receipt")}</span></div><div class="kpi-value">${money(res.total_amount)}</div><div class="kpi-sub">${res.total} xərc</div></div>
      <div class="kpi"><div class="kpi-top"><span>Ən böyük kateqoriya</span><span class="kpi-icon amber">${icon("chart")}</span></div><div class="kpi-value" style="font-size:22px">${top ? esc(top.category) : "—"}</div><div class="kpi-sub">${top ? money(top.amount) : "Məlumat yoxdur"}</div></div>`;
    const area = $("#expArea", content);
    if (!res.items.length) {
      area.innerHTML = st.q || st.category || st.from || st.to
        ? emptyHtml("Nəticə tapılmadı", "Filtrləri dəyişib yenidən yoxlayın.", "", "search")
        : emptyHtml("Hələ xərc yoxdur", "İcarə, maaş, marketinq və digər xərcləri qeyd edin.", `<button class="btn btn-primary btn-sm" data-add>${icon("plus", "icon-sm")} Xərc əlavə et</button>`, "receipt");
      const add = $("[data-add]", area); if (add) add.addEventListener("click", () => openExpenseForm(null, load));
      return;
    }
    area.innerHTML = `<div class="table-wrap"><table class="table stack">
      <thead><tr><th>Xərc</th><th>Kateqoriya</th><th>Tarix</th><th class="num">Məbləğ</th><th>Əlavə edən</th><th></th></tr></thead>
      <tbody>${res.items.map((e) => `<tr>
        <td><div class="cell-main"><div class="kpi-icon">${icon("receipt")}</div><div><b>${esc(e.title)}</b>${e.note ? `<small style="white-space:normal;max-width:320px">${esc(e.note)}</small>` : ""}</div></div></td>
        <td data-label="Kateqoriya"><span class="badge badge-blue no-dot">${esc(e.category)}</span></td>
        <td class="nowrap sub" data-label="Tarix">${esc(formatDate(e.expense_date))}</td>
        <td class="num" data-label="Məbləğ"><b>${money(e.amount)}</b></td>
        <td class="sub" data-label="Əlavə edən">${esc(e.created_by_name || "—")}</td>
        <td class="actions"><button class="btn btn-ghost btn-icon" data-edit="${e.id}" title="Redaktə">${icon("edit")}</button>
          <button class="btn btn-ghost btn-icon" data-del="${e.id}" title="Sil">${icon("trash")}</button></td>
      </tr>`).join("")}</tbody></table></div>${paginationHtml(res, "xərc")}`;
    $$("[data-edit]", area).forEach((b) => b.addEventListener("click", () => openExpenseForm(res.items.find((x) => x.id === Number(b.dataset.edit)), load)));
    $$("[data-del]", area).forEach((b) => b.addEventListener("click", async () => {
      const e = res.items.find((x) => x.id === Number(b.dataset.del));
      if (!(await confirmDialog({ title: "Xərci sil", message: `<b>${esc(e.title)}</b> (${money(e.amount)}) silinsin?`, confirmText: "Sil", danger: true }))) return;
      try { await api(`/api/expenses/${e.id}`, { method: "DELETE" }); toast("Xərc silindi"); load(); } catch (err) { toast(err.message, "error"); }
    }));
    $$("[data-page-nav]", area).forEach((b) => b.addEventListener("click", () => { st.page = Number(b.dataset.pageNav); load(); }));
  };

  $("#eq", content).addEventListener("input", debounce((e) => { st.q = e.target.value.trim(); st.page = 1; load(); }));
  $("#eCat", content).addEventListener("change", (e) => { st.category = e.target.value; st.page = 1; load(); });
  $("#eFrom", content).addEventListener("change", (e) => { st.from = e.target.value; st.page = 1; load(); });
  $("#eTo", content).addEventListener("change", (e) => { st.to = e.target.value; st.page = 1; load(); });
  $("#addExp", content).addEventListener("click", () => openExpenseForm(null, load));
  $("#expExport", content).addEventListener("click", () => downloadFile("/api/reports/export/expenses", "xercler.csv"));
  await load();
}

function openExpenseForm(expense, after) {
  const e = expense || { category: "Digər", expense_date: todayIso() };
  const m = openModal({
    title: expense ? "Xərci redaktə et" : "Yeni xərc",
    body: `<form id="expForm" novalidate><div class="form-grid">
      ${field("title", "Xərcin adı", `<input class="input" name="title" maxlength="120" value="${esc(e.title || "")}" placeholder="Məs. Oktyabr ayı icarə haqqı">`, { required: true, full: true })}
      ${field("amount", "Məbləğ (₼)", `<input class="input" name="amount" type="number" min="0.01" step="0.01" value="${e.amount ?? ""}">`, { required: true })}
      ${field("expense_date", "Tarix", `<input class="input" name="expense_date" type="date" value="${esc(e.expense_date || "")}">`, { required: true })}
      ${field("category", "Kateqoriya", `<select class="select" name="category">${options(EXPENSE_CATEGORIES, e.category)}</select>`, { full: true })}
      ${field("note", "Qeyd", `<textarea class="textarea" name="note" maxlength="1000">${esc(e.note || "")}</textarea>`, { full: true })}
    </div><div class="form-error"></div></form>`,
    foot: `<button class="btn btn-outline" data-close>Ləğv et</button><button class="btn btn-primary" id="saveExp">${icon("check")} Yadda saxla</button>`,
  });
  const form = $("#expForm", m);
  const save = async (ev) => {
    if (ev) ev.preventDefault();
    if (!requireFields(form, [["title", "Xərcin adını daxil edin."], ["amount", "Məbləği daxil edin."], ["expense_date", "Tarixi seçin."]])) return;
    const d = formData(form);
    const body = { title: d.title, amount: Number(d.amount), expense_date: d.expense_date, category: d.category, note: d.note || null };
    const btn = $("#saveExp", m);
    setBusy(btn, true, "Saxlanılır…");
    try {
      await api(expense ? `/api/expenses/${expense.id}` : "/api/expenses", { method: expense ? "PUT" : "POST", body });
      toast(expense ? "Xərc yeniləndi" : "Xərc əlavə edildi");
      m.close();
      after();
    } catch (err) { showFormError(form, err); setBusy(btn, false); }
  };
  form.addEventListener("submit", save);
  $("#saveExp", m).addEventListener("click", save);
}

/* =====================================================================
   SETTINGS
   ===================================================================== */

async function renderSettings(content, id) {
  const [{ settings: s }, admins] = await Promise.all([api("/api/settings"), api("/api/admins")]);
  if (isStale(id)) return;
  const isSuper = App.admin.role === "Super Admin";
  const link = registrationLink();
  content.innerHTML = `
    <section class="panel" style="margin-bottom:20px">
      <div class="panel-head"><div><h3>Qeydiyyat linki</h3><p>Bu linki tələbələrə göndərin (WhatsApp, Instagram, SMS)</p></div>
        ${s.registration_open ? '<span class="badge badge-green">Qeydiyyat açıqdır</span>' : '<span class="badge badge-red">Qeydiyyat bağlıdır</span>'}</div>
      <div class="panel-body"><div class="link-field">
        <input class="input" readonly value="${esc(link)}" aria-label="Qeydiyyat linki">
        <button class="btn btn-primary" id="copyReg">${icon("copy")} Kopyala</button>
        <a class="btn btn-outline" href="${esc(link)}" target="_blank" rel="noopener">${icon("external")} <span class="hide-sm">Aç</span></a>
      </div>
      ${/127\.0\.0\.1|localhost/.test(link) ? `<div class="alert alert-warning" style="margin-top:12px">${icon("info")}<span>Bu link yalnız sizin kompüterdə işləyir. Tələbələrə göndərmək üçün sistemi hostinqə/serverə yerləşdirib domen linkindən istifadə edin.</span></div>` : ""}
      </div>
    </section>

    <div class="grid-2">
      <section class="panel">
        <div class="panel-head"><div><h3>Qeydiyyat səhifəsi ayarları</h3><p>Tələbələrin gördüyü məlumatlar</p></div></div>
        <form class="panel-body" id="settingsForm" novalidate style="display:grid;gap:16px">
          <label class="switch"><input type="checkbox" name="registration_open" ${s.registration_open ? "checked" : ""}><span class="track"></span> Onlayn qeydiyyat açıqdır</label>
          ${field("contact_phone", "Əlaqə telefonu", `<input class="input" name="contact_phone" maxlength="40" value="${esc(s.contact_phone || "")}" placeholder="+994 50 123 45 67">`)}
          ${field("contact_whatsapp", "WhatsApp (nömrə və ya link)", `<input class="input" name="contact_whatsapp" maxlength="200" value="${esc(s.contact_whatsapp || "")}" placeholder="+994501234567">`)}
          ${field("payment_note", "Ödəniş təlimatı", `<textarea class="textarea" name="payment_note" maxlength="1000">${esc(s.payment_note || "")}</textarea>`)}
          ${field("success_message", "Uğurlu qeydiyyat mesajı", `<textarea class="textarea" name="success_message" maxlength="1000">${esc(s.success_message || "")}</textarea>`)}
          <div class="form-error"></div>
          <div><button class="btn btn-primary" id="saveSettings" type="submit">${icon("check")} Yadda saxla</button></div>
        </form>
      </section>

      <div style="display:grid;gap:20px;align-content:start">
        <section class="panel">
          <div class="panel-head"><div><h3>Şifrəni dəyiş</h3><p>${esc(App.admin.full_name)} (${esc(App.admin.username)})</p></div>${icon("lock")}</div>
          <form class="panel-body" id="pwForm" novalidate style="display:grid;gap:14px">
            ${field("current_password", "Cari şifrə", `<input class="input" type="password" name="current_password" autocomplete="current-password">`, { required: true })}
            ${field("new_password", "Yeni şifrə", `<input class="input" type="password" name="new_password" autocomplete="new-password">`, { required: true, hint: "Ən azı 8 simvol, hərf və rəqəm." })}
            ${field("confirm_password", "Yeni şifrə (təkrar)", `<input class="input" type="password" name="confirm_password" autocomplete="new-password">`, { required: true })}
            <div class="form-error"></div>
            <div><button class="btn btn-dark" id="savePw" type="submit">${icon("shield")} Şifrəni yenilə</button></div>
          </form>
        </section>

        <section class="panel">
          <div class="panel-head"><div><h3>Adminlər</h3><p>Sistemə giriş icazəsi olan istifadəçilər</p></div>
            ${isSuper ? `<button class="btn btn-primary btn-sm" id="addUser">${icon("plus", "icon-sm")} Yeni admin</button>` : ""}</div>
          <div class="table-wrap"><table class="table stack"><tbody>${admins.items.map((a) => `<tr>
            <td><div class="cell-main"><div class="avatar">${esc(initials(a.full_name))}</div><div><b>${esc(a.full_name)}${a.id === App.admin.id ? ' <span class="sub" style="display:inline">(siz)</span>' : ""}</b><small>@${esc(a.username)} · ${a.last_login_at ? "son giriş " + esc(timeAgo(a.last_login_at)) : "hələ daxil olmayıb"}</small></div></div></td>
            <td data-label="Rol"><div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end"><span class="badge badge-blue">${esc(adminRoleLabel(a))}</span>${a.is_active ? "" : '<span class="badge badge-gray">Deaktiv</span>'}</div></td>
            ${isSuper ? `<td class="actions"><button class="btn btn-ghost btn-icon" data-uedit="${a.id}" title="Redaktə">${icon("edit")}</button>
              ${a.id === App.admin.id ? "" : `<button class="btn btn-ghost btn-icon" data-udel="${a.id}" title="Sil">${icon("trash")}</button>`}</td>` : ""}</tr>`).join("")}</tbody></table></div>
        </section>
      </div>
    </div>`;

  $("#copyReg", content).addEventListener("click", () => copyText(link));
  if (isSuper) {
    $("#addUser", content).addEventListener("click", () => openUserForm(null, route));
    $$("[data-uedit]", content).forEach((b) => b.addEventListener("click", () => openUserForm(admins.items.find((a) => a.id === Number(b.dataset.uedit)), route)));
    $$("[data-udel]", content).forEach((b) => b.addEventListener("click", async () => {
      const a = admins.items.find((x) => x.id === Number(b.dataset.udel));
      if (!(await confirmDialog({ title: "Admini sil", message: `<b>${esc(a.full_name)}</b> (@${esc(a.username)}) sistemdən silinsin? Bu istifadəçi daha daxil ola bilməyəcək.`, confirmText: "Sil", danger: true }))) return;
      try { await api(`/users/${a.id}`, { method: "DELETE" }); toast("Admin silindi"); route(); } catch (err) { toast(err.message, "error"); }
    }));
  }

  const sf = $("#settingsForm", content);
  sf.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = formData(sf);
    const btn = $("#saveSettings", content);
    setBusy(btn, true, "Saxlanılır…");
    try {
      await api("/api/settings", { method: "PUT", body: d });
      toast("Parametrlər yadda saxlanıldı");
      route();
    } catch (err) { showFormError(sf, err); setBusy(btn, false); }
  });

  const pf = $("#pwForm", content);
  pf.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!requireFields(pf, [["current_password", "Cari şifrəni daxil edin."], ["new_password", "Yeni şifrəni daxil edin."], ["confirm_password", "Şifrəni təkrar daxil edin."]])) return;
    const d = formData(pf);
    if (d.new_password !== d.confirm_password) {
      const f = $('[data-field="confirm_password"]', pf);
      f.classList.add("invalid");
      $(".field-error", f).textContent = "Şifrələr eyni deyil.";
      return;
    }
    const btn = $("#savePw", content);
    setBusy(btn, true, "Yenilənir…");
    try {
      await api("/api/auth/change-password", { method: "POST", body: { current_password: d.current_password, new_password: d.new_password } });
      toast("Şifrə uğurla dəyişdirildi");
      pf.reset();
      setBusy(btn, false);
    } catch (err) { showFormError(pf, err); setBusy(btn, false); }
  });
}

function openUserForm(user, after) {
  const u = user || { role: "Admin", is_active: 1 };
  const m = openModal({
    title: user ? "Admini redaktə et" : "Yeni admin",
    sub: user ? `@${esc(user.username)}` : "Admin panelə giriş icazəsi olan yeni istifadəçi",
    body: `<form id="userForm" novalidate><div class="form-grid">
      ${field("full_name", "Ad Soyad", `<input class="input" name="full_name" maxlength="60" value="${esc(u.full_name || "")}">`, { required: true })}
      ${field("username", "İstifadəçi adı", `<input class="input" name="username" maxlength="32" autocapitalize="none" spellcheck="false" value="${esc(u.username || "")}" placeholder="məs. leyla">`, { required: true, hint: "Kiçik latın hərfləri, rəqəm, . _ -" })}
      ${field("role", "Rol", `<select class="select" name="role">${options(["Super Admin", "Admin"], u.role)}</select>`)}
      ${field("position", "Vəzifə", `<input class="input" name="position" maxlength="80" value="${esc(u.position || "")}" placeholder="məs. Kurs koordinatoru">`)}
      ${field("password", user ? "Yeni şifrə (dəyişmək istəmirsinizsə boş saxlayın)" : "Şifrə", `<input class="input" name="password" type="password" autocomplete="new-password">`, { required: !user, full: true, hint: "Ən azı 8 simvol, hərf və rəqəm." })}
      <div class="full"><label class="switch"><input type="checkbox" name="is_active" ${u.is_active ? "checked" : ""}><span class="track"></span> Aktiv (panelə daxil ola bilər)</label></div>
    </div><div class="form-error"></div></form>`,
    foot: `<button class="btn btn-outline" data-close>Ləğv et</button><button class="btn btn-primary" id="saveUser">${icon("check")} Yadda saxla</button>`,
  });
  const form = $("#userForm", m);
  const save = async (e) => {
    if (e) e.preventDefault();
    const req = [["full_name", "Ad Soyad daxil edin."], ["username", "İstifadəçi adı daxil edin."]];
    if (!user) req.push(["password", "Şifrə daxil edin."]);
    if (!requireFields(form, req)) return;
    const d = formData(form);
    const body = { full_name: d.full_name, username: d.username.toLowerCase(), role: d.role, position: d.position || null, is_active: d.is_active };
    if (d.password) body.password = d.password;
    const btn = $("#saveUser", m);
    setBusy(btn, true, "Saxlanılır…");
    try {
      await api(user ? `/users/${user.id}` : "/users", { method: user ? "PATCH" : "POST", body });
      toast(user ? "Admin yeniləndi" : "Admin əlavə edildi");
      m.close();
      after();
    } catch (err) { showFormError(form, err); setBusy(btn, false); }
  };
  form.addEventListener("submit", save);
  $("#saveUser", m).addEventListener("click", save);
}

/* =====================================================================
   INIT
   ===================================================================== */

async function init() {
  $$(".year").forEach((el) => { el.textContent = new Date().getFullYear(); });
  $("#loginForm").addEventListener("submit", handleLogin);
  const pwToggle = $("#pwToggle");
  pwToggle.innerHTML = icon("eye");
  pwToggle.addEventListener("click", () => {
    const input = $("#password");
    input.type = input.type === "password" ? "text" : "password";
    pwToggle.setAttribute("aria-label", input.type === "password" ? "Şifrəni göstər" : "Şifrəni gizlət");
  });
  $("#logoutBtn").innerHTML = `${icon("logout")}<span>Çıxış</span>`;
  $("#logoutBtn").addEventListener("click", logout);
  $("#menuBtn").innerHTML = icon("menu");
  $("#menuBtn").addEventListener("click", () => $("#app").classList.toggle("nav-open"));
  $("#backdrop").addEventListener("click", () => $("#app").classList.remove("nav-open"));
  $("#copyLinkBtn").innerHTML = `${icon("link", "icon-sm")} Qeydiyyat linki`;
  $("#copyLinkBtn").addEventListener("click", () => copyText(registrationLink()));
  window.addEventListener("hashchange", route);

  if (!storage.get(TOKEN_KEY)) return showLogin();
  try {
    const res = await api("/api/auth/me");
    App.admin = res.admin;
    await startApp();
  } catch (err) {
    storage.remove(TOKEN_KEY);
    showLogin(err.status === 0 ? err.message : "");
  }
}

init();
