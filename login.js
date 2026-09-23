const loginForm = document.getElementById("loginForm");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const loginError = document.getElementById("loginError");
const togglePassword = document.getElementById("togglePassword");

if (togglePassword) {
  togglePassword.addEventListener("click", function () {
    const isPassword = passwordInput.type === "password";

    passwordInput.type = isPassword ? "text" : "password";

    const icon = togglePassword.querySelector("i");

    if (isPassword) {
      icon.classList.remove("fa-eye");
      icon.classList.add("fa-eye-slash");
    } else {
      icon.classList.remove("fa-eye-slash");
      icon.classList.add("fa-eye");
    }
  });
}

if (loginForm) {
  loginForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    loginError.textContent = "";

    if (!username || !password) {
      loginError.textContent = "İstifadəçi adı və şifrəni daxil et.";
      return;
    }

    /*
      Bu hələ DEMO login-dir.
      Real backend qoşulana qədər test üçün işləyəcək.
    */

    const demoUsername = "admin";
    const demoPassword = "123456";

    if (username === demoUsername && password === demoPassword) {
      sessionStorage.setItem("inteliaAdminLoggedIn", "true");

      window.location.href = "./admin.html";
    } else {
      loginError.textContent = "İstifadəçi adı və ya şifrə yanlışdır.";
    }
  });
}