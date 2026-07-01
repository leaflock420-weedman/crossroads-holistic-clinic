import { getAvailableDates, TIME_SLOTS, CLINICIANS } from "./js/data.js";
import { api, setToken } from "./js/api.js";

const CONSULT_FEE = 49;

const steps = Array.from(document.querySelectorAll("[data-flow-step]"));
const progressSteps = Array.from(document.querySelectorAll("[data-progress-steps] li"));
const progressFill = document.querySelector("[data-progress-fill]");
const dateSelect = document.querySelector("[data-date-select]");
const slotGrid = document.querySelector("[data-slot-grid]");
const clinicianSelect = document.querySelector('[data-booking-form] [name="clinician"]');
const bookingPreview = document.querySelector("[data-booking-preview]");
const bookingPreviewText = document.querySelector("[data-booking-preview-text]");
const credentialsEl = document.querySelector("[data-credentials]");

let activeStep = 0;
let booking = { date: "", time: "", clinician: "" };
let patientDraft = {};

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function setStep(index) {
  activeStep = Math.max(0, Math.min(index, steps.length - 1));
  steps.forEach((step, i) => {
    const on = i === activeStep;
    step.classList.toggle("is-active", on);
    step.toggleAttribute("hidden", !on);
  });
  progressSteps.forEach((el, i) => el.classList.toggle("active", i <= activeStep));
  if (progressFill) progressFill.style.width = `${(activeStep / (steps.length - 1)) * 100}%`;
  window.scrollTo({ top: 0, behavior: prefersReduced ? "auto" : "smooth" });
}

document.querySelectorAll("[data-flow-back]").forEach((btn) => {
  btn.addEventListener("click", () => setStep(activeStep - 1));
});

document.querySelector("[data-prescreen-form]")?.addEventListener("submit", (e) => {
  e.preventDefault();
  setStep(1);
});

document.querySelector("[data-details-form]")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  patientDraft = {
    name: `${fd.get("firstName")} ${fd.get("lastName")}`.trim(),
    email: String(fd.get("email") || "").trim(),
    phone: String(fd.get("phone") || "").trim(),
    state: String(fd.get("state") || ""),
    support: String(fd.get("support") || ""),
  };
  setStep(2);
});

function renderSlots() {
  if (!slotGrid) return;
  slotGrid.innerHTML = TIME_SLOTS.map((time) => {
    const taken = Math.random() < 0.18;
    return `<label class="slot${taken ? " taken" : ""}">
      <input type="radio" name="time" value="${time}" ${taken ? "disabled" : ""} required />
      <span>${time}</span>
    </label>`;
  }).join("");
}

function renderDates() {
  if (!dateSelect) return;
  dateSelect.innerHTML = getAvailableDates(14)
    .map((d) => `<option value="${d.value}">${d.label}</option>`)
    .join("");
  booking.date = dateSelect.value;
}

function renderClinicians() {
  if (!clinicianSelect) return;
  CLINICIANS.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    clinicianSelect.appendChild(opt);
  });
}

function updateBookingPreview() {
  if (!booking.date || !booking.time) {
    bookingPreview?.setAttribute("hidden", "");
    return;
  }
  const dateLabel = dateSelect?.selectedOptions[0]?.textContent || booking.date;
  const clinician = booking.clinician || "First available";
  bookingPreviewText.textContent = `${dateLabel} at ${booking.time} · ${clinician}`;
  bookingPreview?.removeAttribute("hidden");
}

dateSelect?.addEventListener("change", () => {
  booking.date = dateSelect.value;
  renderSlots();
  updateBookingPreview();
});

slotGrid?.addEventListener("change", (e) => {
  if (e.target.name === "time") {
    booking.time = e.target.value;
    updateBookingPreview();
  }
});

clinicianSelect?.addEventListener("change", () => {
  booking.clinician = clinicianSelect.value;
  updateBookingPreview();
});

document.querySelector("[data-booking-form]")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const time = e.target.querySelector('[name="time"]:checked');
  if (!time) return;
  booking.time = time.value;
  booking.date = dateSelect.value;
  booking.clinician = clinicianSelect.value || CLINICIANS[0];
  setStep(3);
});

document.querySelector("[data-payment-form]")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.querySelector("[data-pay-btn]");
  btn.disabled = true;
  btn.textContent = "Processing…";

  await new Promise((r) => setTimeout(r, 1200));

  try {
    const result = await api("/api/patients/register", {
      method: "POST",
      body: JSON.stringify({
        ...patientDraft,
        paid: true,
        appointment: {
          date: booking.date,
          time: booking.time,
          clinician: booking.clinician,
          format: "Phone consult",
        },
      }),
    });

    setToken(result.token);

    credentialsEl.innerHTML = `
      <div><dt>Portal email</dt><dd>${result.patient.email}</dd></div>
      <div><dt>Temporary password</dt><dd><code>${result.password}</code></dd></div>
      <div><dt>Consult</dt><dd>${booking.date} at ${booking.time}</dd></div>
      <div><dt>Fee paid</dt><dd>$${CONSULT_FEE}.00 AUD</dd></div>
    `;

    setStep(4);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = `Pay $${CONSULT_FEE} & create portal`;
    alert(err.message);
  }
});

renderDates();
renderSlots();
renderClinicians();
setStep(0);