const toggle = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");
const enquiryForm = document.querySelector("[data-enquiry-form]");
const statusText = document.querySelector("[data-form-status]");
const formSteps = Array.from(document.querySelectorAll("[data-form-step]"));
const stepIndicators = Array.from(document.querySelectorAll("[data-step-indicator]"));
let activeStep = 0;

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

const setStep = (index) => {
  activeStep = Math.max(0, Math.min(index, formSteps.length - 1));

  formSteps.forEach((step, stepIndex) => {
    const isActive = stepIndex === activeStep;
    step.classList.toggle("is-active", isActive);
    step.toggleAttribute("hidden", !isActive);
  });

  stepIndicators.forEach((indicator, indicatorIndex) => {
    indicator.classList.toggle("active", indicatorIndex === activeStep);
  });
};

const validateStep = (index, shouldReport = true) => {
  const step = formSteps[index];

  if (!step) {
    return true;
  }

  const fields = Array.from(step.querySelectorAll("input, select, textarea"));
  const invalid = fields.find((field) => !field.checkValidity());

  if (invalid) {
    if (!shouldReport) {
      return false;
    }

    invalid.reportValidity();
    return false;
  }

  return true;
};

document.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  if (target.hasAttribute("data-next-step")) {
    if (validateStep(activeStep)) {
      setStep(activeStep + 1);
    }
  }

  if (target.hasAttribute("data-back-step")) {
    setStep(activeStep - 1);
  }
});

if (enquiryForm instanceof HTMLFormElement) {
  setStep(0);

  enquiryForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const invalidStep = formSteps.findIndex((_, index) => !validateStep(index, false));

    if (invalidStep !== -1) {
      setStep(invalidStep);
      validateStep(invalidStep);
      return;
    }

    const data = new FormData(enquiryForm);
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    const state = String(data.get("state") || "").trim();
    const contactPreference = String(data.get("contactPreference") || "").trim();
    const support = String(data.get("support") || "").trim();
    const history = String(data.get("history") || "").trim();
    const message = String(data.get("message") || "").trim();
    const subject = `Crossroads new patient signup from ${name || "website visitor"}`;
    const body = [
      "New Crossroads Holistic Clinic signup",
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone || "Not provided"}`,
      `State: ${state || "Not provided"}`,
      `Best contact: ${contactPreference || "Not provided"}`,
      `Support area: ${support || "Not provided"}`,
      `Previous clinic experience: ${history || "Not provided"}`,
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
