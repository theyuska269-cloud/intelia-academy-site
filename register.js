/* Intelia Academy — tələbə qeydiyyatı (3 mərhələ) */

const DRAFT_KEY = "intelia_registration_draft";
const MAX_FILE_MB = 10;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
const OPERATORS = ["10", "12", "50", "51", "55", "60", "70", "77", "99"];
const STEP_NAMES = { 1: "Şəxsi məlumatlar", 2: "Kurs və qrup", 3: "Ödəniş" };

const state = {
  step: 1,
  config: null,
  courses: [],
  groups: [],
  cards: [],
  file: null,
  submitting: false,
  data: {
    first_name: "", last_name: "", phone: "", email: "", education_level: "", university: "", specialty: "",
    graduation_status: "",
    course_id: null, group_id: null, card_id: null, confirmed: false,
  },
};

const card = document.getElementById("regCard");
document.getElementById("year").textContent = new Date().getFullYear();

/* ---------- Qaralama (mobil bank tətbiqinə keçəndə səhifə yenilənsə belə məlumat itmir) ---------- */

function saveDraft() {
  storage.set(DRAFT_KEY, JSON.stringify({ step: state.step, data: state.data, savedAt: Date.now() }));
}

function loadDraft() {
  try {
    const draft = JSON.parse(storage.get(DRAFT_KEY) || "null");
    if (!draft || Date.now() - draft.savedAt > 1000 * 60 * 60 * 24 * 3) return;
    Object.assign(state.data, draft.data || {});
    state.step = Math.min(Math.max(Number(draft.step) || 1, 1), 3);
  } catch { /* köhnə qaralama nəzərə alınmır */ }
}

/* ---------- Validasiya ---------- */

const NAME_RE = /^[^\d<>{}[\]@#$%^*=+|\\/]{2,60}$/u;
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "").replace(/^994/, "").replace(/^0/, "").slice(0, 9);
}

function formatLocalPhone(value) {
  const d = phoneDigits(value);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(" ");
}

function needsUniversity() {
  return state.data.education_level && state.data.education_level !== "Orta təhsil";
}

function validateStep1() {
  const d = state.data;
  const errors = {};
  if (!d.first_name.trim()) errors.first_name = "Adınızı daxil edin.";
  else if (!NAME_RE.test(d.first_name.trim())) errors.first_name = "Ad yalnız hərflərdən ibarət olmalıdır (min. 2).";
  if (!d.last_name.trim()) errors.last_name = "Soyadınızı daxil edin.";
  else if (!NAME_RE.test(d.last_name.trim())) errors.last_name = "Soyad yalnız hərflərdən ibarət olmalıdır (min. 2).";
  const phone = phoneDigits(d.phone);
  if (!phone) errors.phone = "Telefon nömrənizi daxil edin.";
  else if (phone.length !== 9) errors.phone = "Nömrə 9 rəqəmdən ibarət olmalıdır. Nümunə: 50 123 45 67";
  else if (!OPERATORS.includes(phone.slice(0, 2))) errors.phone = "Operator kodu düzgün deyil (50, 51, 55, 70, 77, 99, 10, 60).";
  const email = d.email.trim();
  if (!email) errors.email = "E-poçt ünvanınızı daxil edin.";
  else if (!EMAIL_RE.test(email) || email.includes("..")) errors.email = "E-poçt ünvanı düzgün deyil. Nümunə: ad@gmail.com";
  if (!d.education_level) errors.education_level = "Təhsil səviyyənizi seçin.";
  if (needsUniversity()) {
    if (!d.university.trim()) errors.university = "Universitet / təhsil müəssisəsini daxil edin.";
    if (!d.specialty.trim()) errors.specialty = "İxtisasınızı daxil edin.";
    if (!d.graduation_status) errors.graduation_status = "Bitirib-bitirmədiyinizi seçin.";
  }
  return errors;
}

function validateStep2() {
  const errors = {};
  if (!state.data.course_id) errors.course_id = "Kurs seçin.";
  else if (!state.data.group_id) errors.group_id = "Qrup seçin.";
  return errors;
}

function validateStep3() {
  const errors = {};
  if (!state.data.card_id) errors.card_id = "Ödəniş etdiyiniz kartı seçin.";
  if (!state.file) errors.receipt = "Ödəniş qəbzinin şəklini və ya PDF faylını yükləyin.";
  if (!state.data.confirmed) errors.confirmed = "Davam etmək üçün təsdiq edin.";
  return errors;
}

function showErrors(errors) {
  card.querySelectorAll(".field").forEach((f) => {
    f.classList.remove("invalid");
    const e = f.querySelector(".field-error");
    if (e) e.textContent = "";
  });
  let first = null;
  for (const [name, message] of Object.entries(errors)) {
    const field = card.querySelector(`[data-field="${name}"]`);
    if (!field) continue;
    field.classList.add("invalid");
    const e = field.querySelector(".field-error");
    if (e) e.textContent = message;
    first = first || field;
  }
  if (first) {
    first.scrollIntoView({ behavior: "smooth", block: "center" });
    const input = first.querySelector("input, select");
    if (input && input.type !== "radio" && input.type !== "file") input.focus({ preventScroll: true });
  }
  return !first;
}

/* ---------- Render ---------- */

function selectedCourse() { return state.courses.find((c) => c.id === state.data.course_id) || null; }
function selectedGroup() { return state.groups.find((g) => g.id === state.data.group_id) || null; }

function updateAside() {
  document.querySelectorAll("#asideSteps li").forEach((li) => {
    const n = Number(li.dataset.step);
    li.classList.toggle("active", n === state.step);
    li.classList.toggle("done", n < state.step);
    li.querySelector("span").innerHTML = n < state.step ? icon("check", "icon-sm") : n;
  });
}

function progressHtml() {
  return `
    <div class="progress" aria-label="Qeydiyyat mərhələsi">
      <div class="progress-top">
        <span class="step-no">${state.step}/3 · ${STEP_NAMES[state.step]}</span>
        <span class="step-name">${state.step < 3 ? "Növbəti: " + STEP_NAMES[state.step + 1] : "Son mərhələ"}</span>
      </div>
      <div class="progress-bar">${[1, 2, 3].map((n) => `<span class="${n <= state.step ? "on" : ""}"></span>`).join("")}</div>
    </div>`;
}

function fieldHtml({ name, label, required = true, input, hint = "", full = false }) {
  return `
    <div class="field ${full ? "full" : ""}" data-field="${name}">
      <label for="f_${name}">${label}${required ? ' <span class="req">*</span>' : ""}</label>
      ${input}
      ${hint ? `<span class="hint">${hint}</span>` : ""}
      <span class="field-error"></span>
    </div>`;
}

function render() {
  updateAside();
  if (state.step === 1) renderStep1();
  else if (state.step === 2) renderStep2();
  else renderStep3();
  saveDraft();
}

function renderStep1() {
  const d = state.data;
  const levels = (state.config.education_levels || []).map((l) => `<option ${l === d.education_level ? "selected" : ""}>${esc(l)}</option>`).join("");
  const uniRequired = needsUniversity() || !d.education_level;
  card.innerHTML = `
    ${progressHtml()}
    <form class="step-body" id="stepForm" novalidate>
      <h2 class="step-title">Şəxsi məlumatlar</h2>
      <p class="step-sub">Sizinlə əlaqə saxlaya bilməyimiz üçün məlumatları düzgün daxil edin.</p>
      <div class="form-grid">
        ${fieldHtml({ name: "first_name", label: "Ad", input: `<input class="input" id="f_first_name" name="first_name" autocomplete="given-name" maxlength="60" placeholder="Adınız" value="${esc(d.first_name)}">` })}
        ${fieldHtml({ name: "last_name", label: "Soyad", input: `<input class="input" id="f_last_name" name="last_name" autocomplete="family-name" maxlength="60" placeholder="Soyadınız" value="${esc(d.last_name)}">` })}
        ${fieldHtml({
          name: "phone", label: "Telefon nömrəsi", hint: "WhatsApp aktiv olan nömrə tövsiyə olunur.",
          input: `<div class="phone-input"><span class="prefix">+994</span><input id="f_phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="50 123 45 67" value="${esc(formatLocalPhone(d.phone))}"></div>`,
        })}
        ${fieldHtml({ name: "email", label: "E-poçt", input: `<input class="input" id="f_email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="120" placeholder="ad@gmail.com" value="${esc(d.email)}">` })}
        ${fieldHtml({ name: "education_level", label: "Təhsil səviyyəsi", input: `<select class="select" id="f_education_level" name="education_level"><option value="">Seçin</option>${levels}</select>` })}
        ${fieldHtml({ name: "university", label: "Universitet / təhsil müəssisəsi", required: uniRequired, input: `<input class="input" id="f_university" name="university" maxlength="160" placeholder="Məs. Azərbaycan Dövlət İqtisad Universiteti" value="${esc(d.university)}">` })}
        ${fieldHtml({ name: "specialty", label: "İxtisas", required: uniRequired, input: `<input class="input" id="f_specialty" name="specialty" maxlength="160" placeholder="Məs. Kompüter elmləri" value="${esc(d.specialty)}">` })}
        ${d.education_level === "Orta təhsil" ? "" : fieldHtml({
          name: "graduation_status", label: "Universiteti bitirmisiniz?", required: uniRequired, full: true,
          input: `<div class="seg" role="radiogroup">${(state.config.graduation_statuses || ["Bitirib", "Oxuyur"]).map((g) => `
            <label class="seg-item ${d.graduation_status === g ? "on" : ""}"><input type="radio" name="graduation_status" value="${esc(g)}" ${d.graduation_status === g ? "checked" : ""}>
              ${g === "Bitirib" ? icon("graduation") + " Bəli, bitirmişəm" : icon("book") + " Xeyr, hələ oxuyuram"}</label>`).join("")}</div>`,
        })}
      </div>
    </form>
    <div class="step-actions">
      <span class="spacer"></span>
      <button class="btn btn-primary btn-lg" id="nextBtn" type="button">Davam et ${icon("arrowRight")}</button>
    </div>`;

  const form = card.querySelector("#stepForm");
  form.addEventListener("input", (e) => {
    const { name, value } = e.target;
    if (name === "phone") {
      const caretAtEnd = e.target.selectionStart === e.target.value.length;
      e.target.value = formatLocalPhone(value);
      if (caretAtEnd) e.target.setSelectionRange(e.target.value.length, e.target.value.length);
      state.data.phone = phoneDigits(value);
    } else if (name in state.data && name !== "graduation_status") {
      state.data[name] = value;
    }
    const field = e.target.closest(".field");
    if (field) { field.classList.remove("invalid"); field.querySelector(".field-error").textContent = ""; }
    saveDraft();
  });
  form.addEventListener("change", (e) => {
    if (e.target.name === "education_level") {
      if (e.target.value === "Orta təhsil") state.data.graduation_status = "";
      renderStep1();
    }
    if (e.target.name === "graduation_status") {
      state.data.graduation_status = e.target.value;
      form.querySelectorAll(".seg-item").forEach((l) => l.classList.toggle("on", l.querySelector("input").checked));
      const f = form.querySelector('[data-field="graduation_status"]');
      f.classList.remove("invalid");
      f.querySelector(".field-error").textContent = "";
      saveDraft();
    }
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); next(); });
  card.querySelector("#nextBtn").addEventListener("click", next);

  function next() {
    if (!showErrors(validateStep1())) return;
    state.step = 2;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

async function loadGroups(courseId) {
  state.groups = [];
  if (!courseId) return;
  const res = await api(`/api/public/groups?course_id=${courseId}`, { auth: false });
  state.groups = res.items;
  if (!state.groups.some((g) => g.id === state.data.group_id && !g.is_full)) state.data.group_id = null;
}

function groupChoice(g) {
  const selected = g.id === state.data.group_id;
  const seats = g.seats_left === null ? "" :
    g.is_full ? '<span class="badge badge-red">Yer qalmayıb</span>' :
    `<span class="badge ${g.seats_left <= 3 ? "badge-amber" : "badge-green"}">${g.seats_left} yer qalıb</span>`;
  return `
    <label class="choice ${selected ? "selected" : ""} ${g.is_full ? "disabled" : ""}">
      <input type="radio" name="group_id" value="${g.id}" ${selected ? "checked" : ""} ${g.is_full ? "disabled" : ""}>
      <div class="choice-head"><span class="choice-title">${esc(g.name)}</span>${seats}</div>
      ${g.days.length ? `<div class="day-chips">${g.days.map((n) => `<span class="day-chip">${esc(state.config.week_days[n])}</span>`).join("")}</div>` : ""}
      <div class="choice-meta">
        ${g.start_time ? `<span>${icon("clock")}${esc(timeRange(g.start_time, g.end_time))}</span>` : ""}
        ${g.start_date ? `<span>${icon("calendar")}Başlama: ${esc(formatDate(g.start_date))}</span>` : ""}
        ${g.teacher_name ? `<span>${icon("user")}${esc(g.teacher_name)}</span>` : ""}
      </div>
    </label>`;
}

function groupDetailHtml(course, g) {
  const rows = [
    ["Kurs", course.name], ["Qrup", g.name],
    ["Müəllim", g.teacher_name || "Təyin ediləcək"],
    ["Başlama tarixi", g.start_date ? formatDate(g.start_date) : "Elan ediləcək"],
    ["Dərs günləri", g.days_label || "Elan ediləcək"],
    ["Dərs saatı", timeRange(g.start_time, g.end_time) || "Elan ediləcək"],
    ["Yerlər", g.capacity ? `${g.students_count} / ${g.capacity} (${g.seats_left} boş yer)` : "Limitsiz"],
    ["Kursun qiyməti", money(course.price)],
  ];
  const chats = [g.has_whatsapp && "WhatsApp", g.has_telegram && "Telegram"].filter(Boolean);
  return `
    <div class="group-detail">
      <div class="gd-head">${icon("info")}<b>Seçilmiş qrup haqqında</b></div>
      <dl>${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
      ${chats.length ? `<div class="gd-foot">${icon("message")}<span>Qeydiyyatdan sonra qrupun ${chats.join(" və ")} çatına qoşulma linki göstəriləcək.</span></div>` : ""}
    </div>`;
}

function renderStep2() {
  const d = state.data;
  const course = selectedCourse();
  const group = selectedGroup();
  const contact = state.config.settings.contact_phone;

  const coursesHtml = state.courses.length
    ? `<div class="choice-list">${state.courses.map((c) => `
        <label class="choice ${c.id === d.course_id ? "selected" : ""}">
          <input type="radio" name="course_id" value="${c.id}" ${c.id === d.course_id ? "checked" : ""}>
          <div class="choice-head"><span class="choice-title">${esc(c.name)}</span><span class="choice-price">${money(c.price)}</span></div>
          ${c.description ? `<div class="choice-desc">${esc(c.description)}</div>` : ""}
          <div class="choice-meta">
            ${c.duration ? `<span>${icon("hourglass")}${esc(c.duration)}</span>` : ""}
            <span>${icon("groups")}${c.groups_count ? `${c.groups_count} aktiv qrup` : "Qrup yoxdur"}</span>
          </div>
        </label>`).join("")}</div>`
    : `<div class="empty-box">${icon("book")}<b>Hazırda qəbul açıq olan kurs yoxdur</b>${contact ? `Ətraflı məlumat üçün: <a href="tel:${esc(contact)}">${esc(contact)}</a>` : "Bir az sonra yenidən yoxlayın."}</div>`;

  let groupsHtml = "";
  if (course) {
    groupsHtml = state.groups.length
      ? `<div class="choice-list cols-2">${state.groups.map(groupChoice).join("")}</div>`
      : `<div class="empty-box">${icon("calendar")}<b>Bu kurs üçün hələ aktiv qrup yoxdur</b>Yeni qrup açılanda sizə xəbər verəcəyik — zəhmət olmasa bizimlə əlaqə saxlayın.</div>`;
    if (group) groupsHtml += groupDetailHtml(course, group);
  }

  card.innerHTML = `
    ${progressHtml()}
    <div class="step-body">
      <h2 class="step-title">Kurs və qrup seçimi</h2>
      <p class="step-sub">Öyrənmək istədiyiniz kursu, sonra dərs günləri və saatı sizə uyğun olan qrupu seçin.</p>
      <div class="section-label">Kurs</div>
      <div class="field" data-field="course_id">${coursesHtml}<span class="field-error"></span></div>
      ${course ? `<div class="section-label">Qrup <span class="hint" style="text-transform:none;letter-spacing:0;font-weight:500">${esc(course.name)}</span></div>
      <div class="field" data-field="group_id">${groupsHtml}<span class="field-error"></span></div>` : ""}
    </div>
    <div class="step-actions">
      <button class="btn btn-outline btn-lg" id="backBtn" type="button">${icon("arrowLeft")} Geri</button>
      <span class="spacer"></span>
      <button class="btn btn-primary btn-lg" id="nextBtn" type="button" ${state.courses.length ? "" : "disabled"}>Ödənişə keç ${icon("arrowRight")}</button>
    </div>`;

  card.querySelectorAll('input[name="course_id"]').forEach((el) => el.addEventListener("change", async () => {
    state.data.course_id = Number(el.value);
    state.data.group_id = null;
    card.querySelectorAll('input[name="course_id"]').forEach((i) => i.closest(".choice").classList.toggle("selected", i.checked));
    try {
      await loadGroups(state.data.course_id);
      if (state.groups.length === 1 && !state.groups[0].is_full) state.data.group_id = state.groups[0].id;
    } catch (err) { toast(err.message, "error"); }
    renderStep2();
    saveDraft();
    const target = card.querySelector('[data-field="group_id"]');
    if (target) target.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }));
  card.querySelectorAll('input[name="group_id"]').forEach((el) => el.addEventListener("change", () => {
    state.data.group_id = Number(el.value);
    renderStep2();
  }));
  card.querySelector("#backBtn").addEventListener("click", () => { state.step = 1; render(); });
  card.querySelector("#nextBtn").addEventListener("click", () => {
    if (!showErrors(validateStep2())) return;
    state.step = 3;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function filePreviewHtml() {
  const f = state.file;
  const isImage = f.type.startsWith("image/") && !/heic|heif/.test(f.type);
  return `
    <div class="file-preview">
      <div class="thumb">${isImage ? `<img src="${esc(URL.createObjectURL(f))}" alt="Qəbz">` : icon("file")}</div>
      <div class="meta"><b>${esc(f.name)}</b><small>${(f.size / 1024 / 1024).toFixed(2)} MB</small></div>
      <button class="btn btn-ghost btn-sm" type="button" id="removeFile">${icon("x", "icon-sm")} Sil</button>
    </div>`;
}

function renderStep3() {
  const d = state.data;
  const course = selectedCourse();
  const group = selectedGroup();
  if (!course || !group) { state.step = 2; return render(); }
  const settings = state.config.settings;

  const cardsHtml = state.cards.length
    ? `<div class="choice-list cols-2">${state.cards.map((c) => `
        <label class="bank-card ${c.id === d.card_id ? "selected" : ""}">
          <input type="radio" name="card_id" value="${c.id}" ${c.id === d.card_id ? "checked" : ""}>
          <div class="bank"><span>${esc(c.bank_name)}</span><span class="check">${icon("check")}</span></div>
          <div class="number"><span>${esc(c.card_number_formatted)}</span>
            <button type="button" class="copy-btn" data-copy="${esc(c.card_number)}" aria-label="Kart nömrəsini kopyala">${icon("copy")}</button></div>
          <div class="holder">${esc(c.card_holder)}</div>
          ${c.qr_code_url ? `<button type="button" class="qr-btn" data-qr="${c.id}">${icon("qr", "icon-sm")} QR kodu göstər</button>` : ""}
        </label>`).join("")}</div>`
    : `<div class="empty-box">${icon("card")}<b>Hazırda aktiv ödəniş kartı yoxdur</b>${settings.contact_phone ? `Ödəniş üçün əlaqə: <a href="tel:${esc(settings.contact_phone)}">${esc(settings.contact_phone)}</a>` : "Zəhmət olmasa bir az sonra yenidən yoxlayın."}</div>`;

  card.innerHTML = `
    ${progressHtml()}
    <div class="step-body">
      <h2 class="step-title">Ödəniş</h2>
      <p class="step-sub">Məbləği aşağıdakı kartlardan birinə köçürün və ödəniş qəbzini yükləyin.</p>

      <div class="pay-summary">
        <div><small>${esc(course.name)}</small><b>${esc(group.name)}</b>
          <small>${esc(group.days_label || "")}${group.start_time ? " · " + esc(timeRange(group.start_time, group.end_time)) : ""}</small></div>
        <div class="pay-amount"><small>Ödəniləcək məbləğ</small><strong>${money(course.price)}</strong></div>
      </div>

      <div class="section-label">Ödəniş kartı</div>
      <div class="field" data-field="card_id">${cardsHtml}<span class="field-error"></span></div>
      ${settings.payment_note ? `<div class="alert alert-info" style="margin-top:14px">${icon("info")}<span>${esc(settings.payment_note)}</span></div>` : ""}

      <div class="section-label">Ödəniş qəbzi</div>
      <div class="field" data-field="receipt">
        <div id="fileArea">${state.file ? filePreviewHtml() : `
          <label class="dropzone" id="dropzone">
            <input type="file" id="receiptInput" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf">
            ${icon("upload")}
            <b>Qəbzin şəklini və ya screenshot-u yükləyin</b>
            <small>JPG, PNG, WEBP, HEIC və ya PDF · maks. ${MAX_FILE_MB} MB</small>
          </label>`}</div>
        <span class="field-error"></span>
      </div>

      <div class="field" data-field="confirmed" style="margin-top:18px">
        <label class="checkbox"><input type="checkbox" id="confirmBox" ${d.confirmed ? "checked" : ""}>
          <span>Ödənişi etdiyimi və daxil etdiyim məlumatların doğru olduğunu təsdiq edirəm. Ödəniş statusu admin yoxladıqdan sonra “Ödənilib” olacaq.</span></label>
        <span class="field-error"></span>
      </div>
      <div id="submitError"></div>
    </div>
    <div class="step-actions">
      <button class="btn btn-outline btn-lg" id="backBtn" type="button">${icon("arrowLeft")} Geri</button>
      <span class="spacer"></span>
      <button class="btn btn-primary btn-lg" id="submitBtn" type="button" ${state.cards.length ? "" : "disabled"}>${icon("check")} Qeydiyyatı tamamla</button>
    </div>`;

  card.querySelectorAll('input[name="card_id"]').forEach((el) => el.addEventListener("change", () => {
    state.data.card_id = Number(el.value);
    card.querySelectorAll(".bank-card").forEach((b) => b.classList.toggle("selected", b.querySelector("input").checked));
    clearFieldError("card_id");
    saveDraft();
  }));
  card.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    copyText(b.dataset.copy);
  }));
  card.querySelectorAll("[data-qr]").forEach((b) => b.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showQr(state.cards.find((c) => String(c.id) === b.dataset.qr));
  }));
  card.querySelector("#confirmBox").addEventListener("change", (e) => {
    state.data.confirmed = e.target.checked;
    clearFieldError("confirmed");
    saveDraft();
  });
  bindFileArea();
  card.querySelector("#backBtn").addEventListener("click", () => { state.step = 2; render(); });
  card.querySelector("#submitBtn").addEventListener("click", submit);
}

/* QR ödəniş: kartın qr_code_url (şəkil linki) doludursa göstərilir.
   qr_payload sahəsi gələcəkdə dinamik QR (bank API) üçün saxlanılıb. */
function showQr(c) {
  if (!c || !c.qr_code_url) return;
  const overlay = document.createElement("div");
  overlay.className = "qr-overlay";
  overlay.innerHTML = `<div class="qr-box" role="dialog" aria-modal="true">
      <b>${esc(c.bank_name)}</b><small>${esc(c.card_number_formatted)} · ${esc(c.card_holder)}</small>
      <img src="${esc(c.qr_code_url)}" alt="QR kod">
      <button class="btn btn-outline btn-block" type="button">Bağla</button></div>`;
  const onKey = (e) => { if (e.key === "Escape") close(); };
  const close = () => { overlay.remove(); document.removeEventListener("keydown", onKey); };
  overlay.addEventListener("click", (e) => { if (e.target === overlay || e.target.closest("button")) close(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
}

function clearFieldError(name) {
  const f = card.querySelector(`[data-field="${name}"]`);
  if (f) { f.classList.remove("invalid"); f.querySelector(".field-error").textContent = ""; }
}

function bindFileArea() {
  const area = card.querySelector("#fileArea");
  const remove = area.querySelector("#removeFile");
  if (remove) {
    remove.addEventListener("click", () => { state.file = null; renderStep3(); });
    return;
  }
  const input = area.querySelector("#receiptInput");
  const zone = area.querySelector("#dropzone");
  input.addEventListener("change", () => setFile(input.files[0]));
  ["dragenter", "dragover"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove("drag"); }));
  zone.addEventListener("drop", (e) => setFile(e.dataTransfer.files[0]));
}

function setFile(file) {
  if (!file) return;
  const okType = ALLOWED_TYPES.includes(file.type) || /\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(file.name);
  if (!okType) return showErrors({ receipt: "Yalnız JPG, PNG, WEBP, HEIC şəkil və ya PDF faylı yükləyə bilərsiniz." });
  if (file.size > MAX_FILE_MB * 1024 * 1024) return showErrors({ receipt: `Fayl həcmi ${MAX_FILE_MB} MB-dan çox olmamalıdır.` });
  if (!file.size) return showErrors({ receipt: "Fayl boşdur." });
  state.file = file;
  renderStep3();
}

async function submit() {
  if (state.submitting) return;
  if (!showErrors(validateStep3())) return;
  const btn = card.querySelector("#submitBtn");
  const errBox = card.querySelector("#submitError");
  errBox.innerHTML = "";

  const d = state.data;
  const form = new FormData();
  form.append("first_name", d.first_name.trim());
  form.append("last_name", d.last_name.trim());
  form.append("phone", "+994" + phoneDigits(d.phone));
  form.append("email", d.email.trim());
  form.append("education_level", d.education_level);
  if (d.graduation_status && needsUniversity()) form.append("graduation_status", d.graduation_status);
  if (d.university.trim()) form.append("university", d.university.trim());
  if (d.specialty.trim()) form.append("specialty", d.specialty.trim());
  form.append("course_id", d.course_id);
  form.append("group_id", d.group_id);
  form.append("card_id", d.card_id);
  form.append("receipt", state.file, state.file.name);

  state.submitting = true;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Göndərilir…`;
  try {
    const result = await api("/api/register", { method: "POST", form, auth: false });
    storage.remove(DRAFT_KEY);
    renderSuccess(result);
  } catch (err) {
    errBox.innerHTML = `<div class="alert alert-error" style="margin-top:16px">${icon("alert")}<span>${esc(err.message)}</span></div>`;
    errBox.scrollIntoView({ behavior: "smooth", block: "center" });
    btn.disabled = false;
    btn.innerHTML = `${icon("check")} Qeydiyyatı tamamla`;
  } finally {
    state.submitting = false;
  }
}

function renderSuccess(r) {
  document.querySelectorAll("#asideSteps li").forEach((li) => {
    li.classList.remove("active");
    li.classList.add("done");
    li.querySelector("span").innerHTML = icon("check", "icon-sm");
  });
  const settings = state.config.settings;
  const links = [
    r.whatsapp_link && `<a class="btn btn-whatsapp btn-lg" href="${esc(r.whatsapp_link)}" target="_blank" rel="noopener">${icon("message")} WhatsApp qrupuna qoşul</a>`,
    r.telegram_link && `<a class="btn btn-telegram btn-lg" href="${esc(r.telegram_link)}" target="_blank" rel="noopener">${icon("send")} Telegram qrupuna qoşul</a>`,
  ].filter(Boolean).join("");

  card.innerHTML = `
    <div class="success">
      <div class="success-icon">${icon("check")}</div>
      <h2>Qeydiyyat uğurla tamamlandı!</h2>
      <p>${esc(r.message)}</p>
      <div class="ref-code">Müraciət kodu: ${esc(r.student_code)}
        <button class="btn btn-ghost btn-sm" type="button" id="copyCode" aria-label="Kodu kopyala">${icon("copy", "icon-sm")}</button></div>
      ${r.qr_svg ? `<div class="qr-success">
        <div class="qr-frame" role="img" aria-label="Qeydiyyat QR kodu">${r.qr_svg}</div>
        <div class="qr-text"><b>Qeydiyyat QR kodunuz</b>
          <small>Bu QR kod qeydiyyatınızı təsdiqləyir. Yadda saxlayın və ilk dərsdə göstərin.</small>
          <button class="btn btn-outline btn-sm" type="button" id="downloadQr">${icon("download", "icon-sm")} QR kodu yüklə</button></div>
      </div>` : ""}
      <div class="summary-list">
        <div><span>Ad Soyad</span><b>${esc(r.full_name)}</b></div>
        ${r.email ? `<div><span>E-poçt</span><b>${esc(r.email)}</b></div>` : ""}
        <div><span>Kurs</span><b>${esc(r.course_name)}</b></div>
        <div><span>Qrup</span><b>${esc(r.group_name)}</b></div>
        ${r.days_label ? `<div><span>Dərs günləri</span><b>${esc(r.days_label)}</b></div>` : ""}
        ${r.start_time ? `<div><span>Dərs saatı</span><b>${esc(timeRange(r.start_time, r.end_time))}</b></div>` : ""}
        <div><span>Məbləğ</span><b>${money(r.amount)}</b></div>
        <div><span>Ödəniş statusu</span><b><span class="badge badge-amber">Gözləyir</span></b></div>
      </div>
      ${links ? `<div class="join-links">${links}</div>` : ""}
      ${settings.contact_phone ? `<p class="hint">Suallarınız üçün: <a href="tel:${esc(settings.contact_phone)}">${esc(settings.contact_phone)}</a></p>` : ""}
    </div>`;
  card.querySelector("#copyCode").addEventListener("click", () => copyText(r.student_code));
  const dl = card.querySelector("#downloadQr");
  if (dl) dl.addEventListener("click", () => {
    const svg = r.qr_svg.replace("<svg", '<svg width="600" height="600" style="background:#fff"');
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `intelia-${r.student_code}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderContact() {
  const s = state.config.settings;
  const box = document.getElementById("asideContact");
  const parts = [];
  if (s.contact_phone) parts.push(`<a href="tel:${esc(s.contact_phone)}">${icon("phone", "icon-sm")} ${esc(s.contact_phone)}</a>`);
  if (s.contact_whatsapp) {
    const wa = /^https?:/i.test(s.contact_whatsapp) ? s.contact_whatsapp : `https://wa.me/${s.contact_whatsapp.replace(/\D/g, "")}`;
    parts.push(`<a href="${esc(wa)}" target="_blank" rel="noopener">${icon("message", "icon-sm")} WhatsApp ilə yaz</a>`);
  }
  if (!parts.length) return;
  box.innerHTML = `<b>Sualınız var?</b>${parts.join("")}`;
  box.classList.remove("hidden");
}

async function init() {
  try {
    const [config, courses, cards] = await Promise.all([
      api("/api/public/config", { auth: false }),
      api("/api/public/courses", { auth: false }),
      api("/api/public/cards", { auth: false }),
    ]);
    state.config = config;
    state.courses = courses.items;
    state.cards = cards.items;
    renderContact();

    if (!config.settings.registration_open) {
      card.innerHTML = `<div class="closed">${icon("lock")}<h2 class="step-title">Qeydiyyat müvəqqəti bağlıdır</h2>
        <p class="step-sub">Yeni qəbul elan olunanda bu səhifə yenidən aktiv olacaq.${config.settings.contact_phone ? ` Əlaqə: <a href="tel:${esc(config.settings.contact_phone)}">${esc(config.settings.contact_phone)}</a>` : ""}</p></div>`;
      return;
    }

    loadDraft();
    if (!state.courses.some((c) => c.id === state.data.course_id)) { state.data.course_id = null; state.data.group_id = null; }
    if (!state.cards.some((c) => c.id === state.data.card_id)) state.data.card_id = null;
    if (state.data.course_id) await loadGroups(state.data.course_id);
    if (state.step > 1 && Object.keys(validateStep1()).length) state.step = 1;
    if (state.step > 2 && Object.keys(validateStep2()).length) state.step = 2;
    state.data.confirmed = false;
    render();
  } catch (err) {
    card.innerHTML = `<div class="closed">${icon("alert")}<h2 class="step-title">Səhifəni yükləmək mümkün olmadı</h2>
      <p class="step-sub">${esc(err.message)}</p><button class="btn btn-primary" onclick="location.reload()">${icon("refresh")} Yenidən cəhd et</button></div>`;
  }
}

init();
