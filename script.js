const form = document.getElementById("registerForm");

form.addEventListener("submit", function (event) {
  event.preventDefault();

  const name = document.getElementById("name").value.trim();

  alert(
    `Təşəkkür edirik, ${name}! Müraciətiniz qəbul olundu.`
  );

  form.reset();
});