const navItems = document.querySelectorAll(".nav-item");
const sections = document.querySelectorAll(".content-section");

const pageTitle = document.getElementById("pageTitle");
const pageSubtitle = document.getElementById("pageSubtitle");

const logoutBtn = document.getElementById("logoutBtn");

const modalOverlay = document.getElementById("modalOverlay");
const closeModalBtn = document.getElementById("closeModalBtn");
const modalTitle = document.getElementById("modalTitle");
const dynamicForm = document.getElementById("dynamicForm");

const studentCount = document.getElementById("studentCount");
const teacherCount = document.getElementById("teacherCount");
const groupCount = document.getElementById("groupCount");
const applicationCount = document.getElementById("applicationCount");

const incomeTotal = document.getElementById("incomeTotal");
const expenseTotal = document.getElementById("expenseTotal");
const balanceTotal = document.getElementById("balanceTotal");

const recentApplications = document.getElementById("recentApplications");
const recentPayments = document.getElementById("recentPayments");

const applicationsTable = document.getElementById("applicationsTable");
const studentsTable = document.getElementById("studentsTable");
const teachersTable = document.getElementById("teachersTable");
const groupsGrid = document.getElementById("groupsGrid");
const paymentsTable = document.getElementById("paymentsTable");
const expensesTable = document.getElementById("expensesTable");

const attendanceGroup = document.getElementById("attendanceGroup");
const attendanceDate = document.getElementById("attendanceDate");
const attendanceList = document.getElementById("attendanceList");
const loadAttendanceBtn = document.getElementById("loadAttendanceBtn");

const reportStudents = document.getElementById("reportStudents");
const reportIncome = document.getElementById("reportIncome");
const reportExpenses = document.getElementById("reportExpenses");
const reportBalance = document.getElementById("reportBalance");

const addApplicationBtn = document.getElementById("addApplicationBtn");
const addStudentBtn = document.getElementById("addStudentBtn");
const addTeacherBtn = document.getElementById("addTeacherBtn");
const addGroupBtn = document.getElementById("addGroupBtn");
const addPaymentBtn = document.getElementById("addPaymentBtn");
const addExpenseBtn = document.getElementById("addExpenseBtn");


/* =========================
   LOGIN CHECK
========================= */

if (sessionStorage.getItem("inteliaAdminLoggedIn") !== "true") {
  window.location.href = "./login.html";
}


/* =========================
   STORAGE
========================= */

function getData(key) {
  return JSON.parse(localStorage.getItem(key)) || [];
}

function saveData(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

let applications = getData("inteliaApplications");
let students = getData("inteliaStudents");
let teachers = getData("inteliaTeachers");
let groups = getData("inteliaGroups");
let payments = getData("inteliaPayments");
let expenses = getData("inteliaExpenses");
let attendance = getData("inteliaAttendance");


/* =========================
   NAVIGATION
========================= */

const sectionInfo = {
  dashboard: {
    title: "İdarə paneli",
    subtitle: "Intelia Academy idarəetmə sistemi"
  },

  applications: {
    title: "Müraciətlər",
    subtitle: "Yeni kurs müraciətlərini idarə et"
  },

  students: {
    title: "Tələbələr",
    subtitle: "Tələbə bazasını idarə et"
  },

  teachers: {
    title: "Müəllimlər",
    subtitle: "Müəllim məlumatlarını idarə et"
  },

  groups: {
    title: "Qruplar",
    subtitle: "Dərs qruplarını idarə et"
  },

  attendance: {
    title: "Davamiyyət",
    subtitle: "Tələbələrin davamiyyətini qeyd et"
  },

  payments: {
    title: "Ödənişlər",
    subtitle: "Tələbə ödənişlərini idarə et"
  },

  expenses: {
    title: "Xərclər",
    subtitle: "Akademiyanın xərclərini qeyd et"
  },

  reports: {
    title: "Hesabatlar",
    subtitle: "Ümumi göstəriciləri izlə"
  }
};

navItems.forEach((item) => {
  item.addEventListener("click", function (event) {
    event.preventDefault();

    const sectionId = item.dataset.section;

    navItems.forEach((nav) => nav.classList.remove("active"));
    item.classList.add("active");

    sections.forEach((section) => {
      section.classList.remove("active-section");
    });

    document.getElementById(sectionId).classList.add("active-section");

    pageTitle.textContent = sectionInfo[sectionId].title;
    pageSubtitle.textContent = sectionInfo[sectionId].subtitle;

    refreshAll();
  });
});


/* =========================
   LOGOUT
========================= */

logoutBtn.addEventListener("click", function () {
  sessionStorage.removeItem("inteliaAdminLoggedIn");
  window.location.href = "./login.html";
});


/* =========================
   MODAL
========================= */

function openModal(title, html, submitHandler) {
  modalTitle.textContent = title;
  dynamicForm.innerHTML = html;

  modalOverlay.classList.add("active");

  dynamicForm.onsubmit = function (event) {
    event.preventDefault();

    submitHandler(new FormData(dynamicForm));

    closeModal();
  };
}

function closeModal() {
  modalOverlay.classList.remove("active");
  dynamicForm.innerHTML = "";
}

closeModalBtn.addEventListener("click", closeModal);

modalOverlay.addEventListener("click", function (event) {
  if (event.target === modalOverlay) {
    closeModal();
  }
});


/* =========================
   APPLICATIONS
========================= */

addApplicationBtn.addEventListener("click", function () {
  openModal(
    "Yeni müraciət",
    `
      <div class="modal-form-group">
        <label>Ad və soyad</label>
        <input name="name" required>
      </div>

      <div class="modal-form-group">
        <label>Telefon</label>
        <input name="phone" required>
      </div>

      <div class="modal-form-group">
        <label>Kurs</label>
        <select name="course" required>
          <option value="">Seç</option>
          <option>Frontend Development</option>
          <option>Cyber Security</option>
          <option>Data Analytics</option>
        </select>
      </div>

      <div class="modal-form-group">
        <label>Status</label>
        <select name="status">
          <option value="Yeni">Yeni</option>
          <option value="Əlaqə saxlanılıb">Əlaqə saxlanılıb</option>
          <option value="Qeydiyyat">Qeydiyyat</option>
        </select>
      </div>

      <button class="modal-submit-btn" type="submit">
        Yadda saxla
      </button>
    `,
    function (formData) {
      applications.push({
        id: Date.now(),
        name: formData.get("name"),
        phone: formData.get("phone"),
        course: formData.get("course"),
        status: formData.get("status")
      });

      saveData("inteliaApplications", applications);
      refreshAll();
    }
  );
});


/* =========================
   STUDENTS
========================= */

addStudentBtn.addEventListener("click", function () {
  const groupOptions = groups
    .map((group) => `<option>${group.name}</option>`)
    .join("");

  openModal(
    "Tələbə əlavə et",
    `
      <div class="modal-form-group">
        <label>Ad və soyad</label>
        <input name="name" required>
      </div>

      <div class="modal-form-group">
        <label>Telefon</label>
        <input name="phone" required>
      </div>

      <div class="modal-form-group">
        <label>Kurs</label>
        <select name="course" required>
          <option value="">Seç</option>
          <option>Frontend Development</option>
          <option>Cyber Security</option>
          <option>Data Analytics</option>
        </select>
      </div>

      <div class="modal-form-group">
        <label>Qrup</label>
        <select name="group">
          <option value="">Qrup yoxdur</option>
          ${groupOptions}
        </select>
      </div>

      <div class="modal-form-group">
        <label>Status</label>
        <select name="status">
          <option value="Aktiv">Aktiv</option>
          <option value="Passiv">Passiv</option>
        </select>
      </div>

      <button class="modal-submit-btn" type="submit">
        Yadda saxla
      </button>
    `,
    function (formData) {
      students.push({
        id: Date.now(),
        name: formData.get("name"),
        phone: formData.get("phone"),
        course: formData.get("course"),
        group: formData.get("group"),
        status: formData.get("status")
      });

      saveData("inteliaStudents", students);
      refreshAll();
    }
  );
});


/* =========================
   TEACHERS
========================= */

addTeacherBtn.addEventListener("click", function () {
  openModal(
    "Müəllim əlavə et",
    `
      <div class="modal-form-group">
        <label>Ad və soyad</label>
        <input name="name" required>
      </div>

      <div class="modal-form-group">
        <label>Telefon</label>
        <input name="phone" required>
      </div>

      <div class="modal-form-group">
        <label>İxtisas</label>
        <input name="speciality" required>
      </div>

      <button class="modal-submit-btn" type="submit">
        Yadda saxla
      </button>
    `,
    function (formData) {
      teachers.push({
        id: Date.now(),
        name: formData.get("name"),
        phone: formData.get("phone"),
        speciality: formData.get("speciality")
      });

      saveData("inteliaTeachers", teachers);
      refreshAll();
    }
  );
});


/* =========================
   GROUPS
========================= */

addGroupBtn.addEventListener("click", function () {
  const teacherOptions = teachers
    .map((teacher) => `<option>${teacher.name}</option>`)
    .join("");

  openModal(
    "Qrup əlavə et",
    `
      <div class="modal-form-group">
        <label>Qrup adı</label>
        <input name="name" required>
      </div>

      <div class="modal-form-group">
        <label>Kurs</label>
        <select name="course" required>
          <option value="">Seç</option>
          <option>Frontend Development</option>
          <option>Cyber Security</option>
          <option>Data Analytics</option>
        </select>
      </div>

      <div class="modal-form-group">
        <label>Müəllim</label>
        <select name="teacher">
          <option value="">Müəllim seçilməyib</option>
          ${teacherOptions}
        </select>
      </div>

      <div class="modal-form-group">
        <label>Dərs vaxtı</label>
        <input name="schedule" placeholder="B.e / Ç.a / Cümə - 19:00">
      </div>

      <button class="modal-submit-btn" type="submit">
        Yadda saxla
      </button>
    `,
    function (formData) {
      groups.push({
        id: Date.now(),
        name: formData.get("name"),
        course: formData.get("course"),
        teacher: formData.get("teacher"),
        schedule: formData.get("schedule")
      });

      saveData("inteliaGroups", groups);
      refreshAll();
    }
  );
});


/* =========================
   PAYMENTS
========================= */

addPaymentBtn.addEventListener("click", function () {
  const studentOptions = students
    .map((student) => `<option>${student.name}</option>`)
    .join("");

  openModal(
    "Ödəniş əlavə et",
    `
      <div class="modal-form-group">
        <label>Tələbə</label>
        <select name="student" required>
          <option value="">Seç</option>
          ${studentOptions}
        </select>
      </div>

      <div class="modal-form-group">
        <label>Məbləğ</label>
        <input
          type="number"
          name="amount"
          min="0"
          step="0.01"
          required
        >
      </div>

      <div class="modal-form-group">
        <label>Tarix</label>
        <input type="date" name="date" required>
      </div>

      <div class="modal-form-group">
        <label>Qeyd</label>
        <textarea name="note" rows="3"></textarea>
      </div>

      <button class="modal-submit-btn" type="submit">
        Yadda saxla
      </button>
    `,
    function (formData) {
      payments.push({
        id: Date.now(),
        student: formData.get("student"),
        amount: Number(formData.get("amount")),
        date: formData.get("date"),
        note: formData.get("note")
      });

      saveData("inteliaPayments", payments);
      refreshAll();
    }
  );
});


/* =========================
   EXPENSES
========================= */

addExpenseBtn.addEventListener("click", function () {
  openModal(
    "Xərc əlavə et",
    `
      <div class="modal-form-group">
        <label>Başlıq</label>
        <input name="title" required>
      </div>

      <div class="modal-form-group">
        <label>Məbləğ</label>
        <input
          type="number"
          name="amount"
          min="0"
          step="0.01"
          required
        >
      </div>

      <div class="modal-form-group">
        <label>Tarix</label>
        <input type="date" name="date" required>
      </div>

      <button class="modal-submit-btn" type="submit">
        Yadda saxla
      </button>
    `,
    function (formData) {
      expenses.push({
        id: Date.now(),
        title: formData.get("title"),
        amount: Number(formData.get("amount")),
        date: formData.get("date")
      });

      saveData("inteliaExpenses", expenses);
      refreshAll();
    }
  );
});


/* =========================
   DELETE
========================= */

function deleteItem(type, id) {
  if (!confirm("Silmək istədiyinizə əminsiniz?")) {
    return;
  }

  if (type === "application") {
    applications = applications.filter((item) => item.id !== id);
    saveData("inteliaApplications", applications);
  }

  if (type === "student") {
    students = students.filter((item) => item.id !== id);
    saveData("inteliaStudents", students);
  }

  if (type === "teacher") {
    teachers = teachers.filter((item) => item.id !== id);
    saveData("inteliaTeachers", teachers);
  }

  if (type === "group") {
    groups = groups.filter((item) => item.id !== id);
    saveData("inteliaGroups", groups);
  }

  if (type === "payment") {
    payments = payments.filter((item) => item.id !== id);
    saveData("inteliaPayments", payments);
  }

  if (type === "expense") {
    expenses = expenses.filter((item) => item.id !== id);
    saveData("inteliaExpenses", expenses);
  }

  refreshAll();
}


/* =========================
   RENDER APPLICATIONS
========================= */

function renderApplications() {
  if (!applications.length) {
    applicationsTable.innerHTML = `
      <tr>
        <td colspan="5" class="empty-cell">
          Hələ müraciət yoxdur
        </td>
      </tr>
    `;

    recentApplications.innerHTML = `
      <tr>
        <td colspan="4" class="empty-cell">
          Hələ müraciət yoxdur
        </td>
      </tr>
    `;

    return;
  }

  applicationsTable.innerHTML = applications
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.phone)}</td>
          <td>${escapeHtml(item.course)}</td>

          <td>
            <span class="status-badge ${
              item.status === "Yeni" ? "pending" : ""
            }">
              ${escapeHtml(item.status)}
            </span>
          </td>

          <td>
            <button
              class="table-action-btn delete"
              onclick="deleteItem('application', ${item.id})"
            >
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `
    )
    .join("");

  recentApplications.innerHTML = applications
    .slice(-5)
    .reverse()
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.phone)}</td>
          <td>${escapeHtml(item.course)}</td>

          <td>
            <span class="status-badge ${
              item.status === "Yeni" ? "pending" : ""
            }">
              ${escapeHtml(item.status)}
            </span>
          </td>
        </tr>
      `
    )
    .join("");
}


/* =========================
   RENDER STUDENTS
========================= */

function renderStudents() {
  if (!students.length) {
    studentsTable.innerHTML = `
      <tr>
        <td colspan="6" class="empty-cell">
          Hələ tələbə yoxdur
        </td>
      </tr>
    `;
    return;
  }

  studentsTable.innerHTML = students
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.phone)}</td>
          <td>${escapeHtml(item.course)}</td>
          <td>${escapeHtml(item.group || "-")}</td>

          <td>
            <span class="status-badge ${
              item.status === "Passiv" ? "inactive" : ""
            }">
              ${escapeHtml(item.status)}
            </span>
          </td>

          <td>
            <button
              class="table-action-btn delete"
              onclick="deleteItem('student', ${item.id})"
            >
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `
    )
    .join("");
}


/* =========================
   RENDER TEACHERS
========================= */

function renderTeachers() {
  if (!teachers.length) {
    teachersTable.innerHTML = `
      <tr>
        <td colspan="4" class="empty-cell">
          Hələ müəllim yoxdur
        </td>
      </tr>
    `;
    return;
  }

  teachersTable.innerHTML = teachers
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.phone)}</td>
          <td>${escapeHtml(item.speciality)}</td>

          <td>
            <button
              class="table-action-btn delete"
              onclick="deleteItem('teacher', ${item.id})"
            >
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `
    )
    .join("");
}


/* =========================
   RENDER GROUPS
========================= */

function renderGroups() {
  if (!groups.length) {
    groupsGrid.innerHTML = `
      <div class="panel-card">
        <div class="empty-cell">
          Hələ qrup yoxdur
        </div>
      </div>
    `;
  } else {
    groupsGrid.innerHTML = groups
      .map((item) => {
        const groupStudents = students.filter(
          (student) => student.group === item.name
        ).length;

        return `
          <article class="group-card">

            <h3>${escapeHtml(item.name)}</h3>

            <p>${escapeHtml(item.course)}</p>

            <div class="group-meta">

              <div>
                <i class="fa-solid fa-chalkboard-user"></i>
                ${escapeHtml(item.teacher || "Müəllim seçilməyib")}
              </div>

              <div>
                <i class="fa-solid fa-clock"></i>
                ${escapeHtml(item.schedule || "Vaxt qeyd edilməyib")}
              </div>

              <div>
                <i class="fa-solid fa-user-graduate"></i>
                ${groupStudents} tələbə
              </div>

            </div>

            <div class="group-actions">
              <button
                class="table-action-btn delete"
                onclick="deleteItem('group', ${item.id})"
              >
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>

          </article>
        `;
      })
      .join("");
  }

  attendanceGroup.innerHTML = `
    <option value="">Qrup seç</option>
    ${groups
      .map(
        (group) =>
          `<option value="${escapeHtml(group.name)}">${escapeHtml(
            group.name
          )}</option>`
      )
      .join("")}
  `;
}


/* =========================
   RENDER PAYMENTS
========================= */

function renderPayments() {
  if (!payments.length) {
    paymentsTable.innerHTML = `
      <tr>
        <td colspan="5" class="empty-cell">
          Hələ ödəniş yoxdur
        </td>
      </tr>
    `;

    recentPayments.innerHTML = `
      <tr>
        <td colspan="3" class="empty-cell">
          Hələ ödəniş yoxdur
        </td>
      </tr>
    `;

    return;
  }

  paymentsTable.innerHTML = payments
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.student)}</td>
          <td>${formatMoney(item.amount)}</td>
          <td>${escapeHtml(item.date)}</td>
          <td>${escapeHtml(item.note || "-")}</td>

          <td>
            <button
              class="table-action-btn delete"
              onclick="deleteItem('payment', ${item.id})"
            >
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `
    )
    .join("");

  recentPayments.innerHTML = payments
    .slice(-5)
    .reverse()
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.student)}</td>
          <td>${formatMoney(item.amount)}</td>
          <td>${escapeHtml(item.date)}</td>
        </tr>
      `
    )
    .join("");
}


/* =========================
   RENDER EXPENSES
========================= */

function renderExpenses() {
  if (!expenses.length) {
    expensesTable.innerHTML = `
      <tr>
        <td colspan="4" class="empty-cell">
          Hələ xərc yoxdur
        </td>
      </tr>
    `;
    return;
  }

  expensesTable.innerHTML = expenses
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.title)}</td>
          <td>${formatMoney(item.amount)}</td>
          <td>${escapeHtml(item.date)}</td>

          <td>
            <button
              class="table-action-btn delete"
              onclick="deleteItem('expense', ${item.id})"
            >
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `
    )
    .join("");
}


/* =========================
   ATTENDANCE
========================= */

loadAttendanceBtn.addEventListener("click", function () {
  const groupName = attendanceGroup.value;
  const date = attendanceDate.value;

  if (!groupName || !date) {
    attendanceList.innerHTML = `
      <p class="empty-cell">
        Qrup və tarix seç.
      </p>
    `;
    return;
  }

  const groupStudents = students.filter(
    (student) => student.group === groupName
  );

  if (!groupStudents.length) {
    attendanceList.innerHTML = `
      <p class="empty-cell">
        Bu qrupda tələbə yoxdur.
      </p>
    `;
    return;
  }

  attendanceList.innerHTML = groupStudents
    .map((student) => {
      const record = attendance.find(
        (item) =>
          item.studentId === student.id &&
          item.group === groupName &&
          item.date === date
      );

      return `
        <div class="attendance-row">

          <strong>${escapeHtml(student.name)}</strong>

          <div class="attendance-actions">

            <button
              class="attendance-present"
              onclick="setAttendance(
                ${student.id},
                '${safeJsString(groupName)}',
                '${safeJsString(date)}',
                'İştirak'
              )"
            >
              İştirak
            </button>

            <button
              class="attendance-absent"
              onclick="setAttendance(
                ${student.id},
                '${safeJsString(groupName)}',
                '${safeJsString(date)}',
                'Yoxdur'
              )"
            >
              Yoxdur
            </button>

            ${
              record
                ? `<span class="status-badge">${escapeHtml(
                    record.status
                  )}</span>`
                : ""
            }

          </div>

        </div>
      `;
    })
    .join("");
});

function setAttendance(studentId, group, date, status) {
  const existing = attendance.find(
    (item) =>
      item.studentId === studentId &&
      item.group === group &&
      item.date === date
  );

  if (existing) {
    existing.status = status;
  } else {
    attendance.push({
      id: Date.now(),
      studentId,
      group,
      date,
      status
    });
  }

  saveData("inteliaAttendance", attendance);
  loadAttendanceBtn.click();
}


/* =========================
   DASHBOARD
========================= */

function updateDashboard() {
  const activeStudents = students.filter(
    (student) => student.status === "Aktiv"
  ).length;

  const income = payments.reduce(
    (total, item) => total + Number(item.amount || 0),
    0
  );

  const expense = expenses.reduce(
    (total, item) => total + Number(item.amount || 0),
    0
  );

  const balance = income - expense;

  studentCount.textContent = activeStudents;
  teacherCount.textContent = teachers.length;
  groupCount.textContent = groups.length;
  applicationCount.textContent = applications.length;

  incomeTotal.textContent = formatMoney(income);
  expenseTotal.textContent = formatMoney(expense);
  balanceTotal.textContent = formatMoney(balance);

  reportStudents.textContent = students.length;
  reportIncome.textContent = formatMoney(income);
  reportExpenses.textContent = formatMoney(expense);
  reportBalance.textContent = formatMoney(balance);
}


/* =========================
   HELPERS
========================= */

function formatMoney(amount) {
  return `${Number(amount || 0).toFixed(2)} ₼`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeJsString(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'");
}


/* =========================
   REFRESH
========================= */

function refreshAll() {
  renderApplications();
  renderStudents();
  renderTeachers();
  renderGroups();
  renderPayments();
  renderExpenses();
  updateDashboard();
}

refreshAll();