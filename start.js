import { getAvailableDates } from "./js/data.js";
import { api, setToken } from "./js/api.js";
import { initSiteLinks } from "./js/sites.js";

initSiteLinks();

const CONSULT_FEE = 49;

const steps = Array.from(document.querySelectorAll("[data-flow-step]"));
const progressSteps = Array.from(document.querySelectorAll("[data-progress-steps] li"));
const progressFill = document.querySelector("[data-progress-fill]");
const dateSelect = document.querySelector("[data-date-select]");
const slotGrid = document.querySelector("[data-slot-grid]");
const doctorSelect = document.querySelector("[data-doctor-select]");
const slotsHint = document.querySelector("[data-slots-hint]");
const bookingPreview = document.querySelector("[data-booking-preview]");
const bookingPreviewText = document.querySelector("[data-booking-preview-text]");
const credentialsEl = document.querySelector("[data-credentials]");

let activeStep = 0;
let booking = { date: "", time: "", doctorId: "", clinician: "" };
let patientDraft = {};
let doctors = [];

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

async function loadDoctors() {
  try {
    const data = await api("/api/doctors");
    doctors = data.doctors || [];
    if (!doctorSelect) return;
    doctorSelect.innerHTML = doctors.length
      ? doctors.map((d) => `<option value="${d.id}">${d.name}</option>`).join("")
      : `<option value="">No clinicians available</option>`;
    booking.doctorId = doctorSelect.value;
    booking.clinician = doctors.find((d) => d.id === booking.doctorId)?.name || "";
    await renderSlots();
  } catch {
    doctorSelect.innerHTML = `<option value="">Clinicians unavailable — try again shortly</option>`;
  }
}

async function renderSlots() {
  if (!slotGrid) return;
  booking.doctorId = doctorSelect?.value || "";
  booking.date = dateSelect?.value || "";
  const doctor = doctors.find((d) => d.id === booking.doctorId);
  booking.clinician = doctor?.name || "";

  if (!booking.doctorId || !booking.date) {
    slotGrid.innerHTML = `<p class="empty-state">Select a clinician and date.</p>`;
    return;
  }

  slotGrid.innerHTML = `<p class="empty-state">Loading times…</p>`;
  try {
    const data = await api(`/api/booking/slots?doctorId=${encodeURIComponent(booking.doctorId)}&date=${encodeURIComponent(booking.date)}`);
    const times = data.available || [];
    if (!times.length) {
      slotGrid.innerHTML = `<p class="empty-state">No open 15-minute slots for this day. Try another date.</p>`;
      slotsHint.textContent = "The clinician may need to add availability in their portal.";
      slotsHint.hidden = false;
      return;
    }
    slotsHint.hidden = true;
    slotGrid.innerHTML = times.map((time) => `
      <label class="slot">
        <input type="radio" name="time" value="${time}" required />
        <span>${time}</span>
      </label>
    `).join("");
  } catch (err) {
    slotGrid.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

function renderDates() {
  if (!dateSelect) return;
  dateSelect.innerHTML = getAvailableDates(14)
    .map((d) => `<option value="${d.value}">${d.label}</option>`)
    .join("");
  booking.date = dateSelect.value;
}

function updateBookingPreview() {
  if (!booking.date || !booking.time) {
    bookingPreview?.setAttribute("hidden", "");
    return;
  }
  const dateLabel = dateSelect?.selectedOptions[0]?.textContent || booking.date;
  const clinician = booking.clinician || "Clinician";
  bookingPreviewText.textContent = `${dateLabel} at ${booking.time} · ${clinician} · 15 min`;
  bookingPreview?.removeAttribute("hidden");
}

dateSelect?.addEventListener("change", async () => {
  booking.date = dateSelect.value;
  await renderSlots();
  updateBookingPreview();
});

doctorSelect?.addEventListener("change", async () => {
  booking.doctorId = doctorSelect.value;
  booking.clinician = doctors.find((d) => d.id === booking.doctorId)?.name || "";
  await renderSlots();
  updateBookingPreview();
});

slotGrid?.addEventListener("change", (e) => {
  if (e.target.name === "time") {
    booking.time = e.target.value;
    updateBookingPreview();
  }
});

document.querySelector("[data-booking-form]")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const time = e.target.querySelector('[name="time"]:checked');
  if (!time) return;
  booking.time = time.value;
  booking.date = dateSelect.value;
  booking.doctorId = doctorSelect.value;
  booking.clinician = doctors.find((d) => d.id === booking.doctorId)?.name || "";
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
        assignedDoctorId: booking.doctorId,
        appointment: {
          date: booking.date,
          time: booking.time,
          doctorId: booking.doctorId,
          clinician: booking.clinician,
          format: "Phone consult",
        },
      }),
    });

    setToken(result.token);

    credentialsEl.innerHTML = `
      <div><dt>Portal email</dt><dd>${result.patient.email}</dd></div>
      <div><dt>Temporary password</dt><dd><code>${result.password}</code></dd></div>
      <div><dt>Consult</dt><dd>${booking.date} at ${booking.time} · 15 min</dd></div>
      <div><dt>Clinician</dt><dd>${booking.clinician}</dd></div>
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
loadDoctors();
setStep(0);