const toggle = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");
const enquiryForm = document.querySelector("[data-enquiry-form]");
const statusText = document.querySelector("[data-form-status]");

if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

if (enquiryForm instanceof HTMLFormElement) {
  enquiryForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const data = new FormData(enquiryForm);
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    const state = String(data.get("state") || "").trim();
    const support = String(data.get("support") || "").trim();
    const message = String(data.get("message") || "").trim();
    const subject = `Crossroads new patient signup from ${name || "website visitor"}`;
    const body = [
      "New Crossroads Holistic Clinic signup",
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone || "Not provided"}`,
      `State: ${state || "Not provided"}`,
      `Support area: ${support || "Not provided"}`,
      "",
      "Short intake note:",
      message || "No note provided.",
      "",
      "CRM stage: New signup",
      "Next step: Intake review and patient portal invite when appropriate.",
    ].join("\n");

    if (statusText) {
      statusText.textContent = "Opening your email app with the signup ready to send.";
    }

    window.location.href = `mailto:hello@crossroadsholisticclinic.com.au?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
}
