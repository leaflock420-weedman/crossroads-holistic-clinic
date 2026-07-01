import { generateTimeSlots } from "./js/data.js";
import { api, setToken, getToken, configureAuth, clearOtherPortalTokens } from "./js/api.js";

configureAuth("doctor");

const loginView = document.querySelector("[data-login-view]");
const appView = document.querySelector("[data-app-view]");
const loginForm = document.querySelector("[data-login-form]");
const loginError = document.querySelector("[data-login-error]");
const metricsEl = document.querySelector("[data-crm-metrics]");
const searchInput = document.querySelector("[data-search]");
const detailPanel = document.querySelector("[data-detail-panel]");
const detailEmpty = document.querySelector("[data-detail-empty]");
const detailBody = document.querySelector("[data-detail-body]");
const scriptForm = document.querySelector("[data-script-form]");
const newScriptBtn = document.querySelector("[data-new-script]");
const callBanner = document.querySelector("[data-call-banner]");
const callMsg = document.querySelector("[data-call-msg]");
const callLink = document.querySelector("[data-call-link]");
const callDone = document.querySelector("[data-call-done]");

let queue = [];
let selectedId = null;
let activeAppointmentId = null;
let searchQuery = "";

const STAGES = {
  "up-next": { label: "Up next", match: (item) => item.appointment.telehealthStatus === "scheduled" },
  "on-call": { label: "On call", match: (item) => item.appointment.telehealthStatus === "in_progress" },
  "wrap-up": {
    label: "Wrap up",
    match: (item) =>
      item.appointment.telehealthStatus === "completed" ||
      item.prescriptions.some((rx) => ["pending_review", "pending_dispense", "reorder_requested"].includes(rx.status)),
  },
};

function showLogin() {
  setToken(null);
  loginView.hidden = false;
  appView.hidden = true;
}

function showApp() {
  loginView.hidden = true;
  appView.hidden = false;
}

function stageFor(item) {
  if (item.appointment.telehealthStatus === "in_progress") return "on-call";
  if (
    item.appointment.telehealthStatus === "completed" ||
    item.prescriptions.some((rx) =>
      ["pending_review", "pending_dispense", "reorder_requested"].includes(rx.status)
    )
  ) {
    return "wrap-up";
  }
  return "up-next";
}

function filteredQueue() {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return queue;
  return queue.filter(({ patient, appointment }) => {
    const hay = `${patient?.name || ""} ${patient?.phone || ""} ${appointment.time}`.toLowerCase();
    return hay.includes(q);
  });
}

function renderMetrics() {
  const items = filteredQueue();
  const counts = { "up-next": 0, "on-call": 0, "wrap-up": 0 };
  items.forEach((item) => {
    counts[stageFor(item)] += 1;
  });

  metricsEl.innerHTML = `
    <article class="crm-metric"><strong>${items.length}</strong><span>Total today</span></article>
    <article class="crm-metric"><strong>${counts["on-call"]}</strong><span>On call</span></article>
    <article class="crm-metric"><strong>${counts["wrap-up"]}</strong><span>Needs wrap-up</span></article>
  `;

  Object.keys(counts).forEach((key) => {
    const el = document.querySelector(`[data-count="${key}"]`);
    if (el) el.textContent = counts[key];
  });
}

function cardHtml(item) {
  const { appointment: a, patient, prescriptions } = item;
  const stage = stageFor(item);
  const pendingRx = prescriptions.some((rx) => rx.status === "pending_review");
  const reorder = prescriptions.some((rx) => rx.status === "reorder_requested");
  const selected = selectedId === patient?.id;

  return `
    <article class="crm-card ${selected ? "is-selected" : ""}" data-card data-patient-id="${patient?.id}" data-appointment-id="${a.id}" tabindex="0">
      <div class="crm-card__top">
        <div class="crm-avatar">${(patient?.name || "?").charAt(0)}</div>
        <div>
          <h3>${patient?.name || "Patient"}</h3>
          <p class="crm-card__time">${a.date} · ${a.time}</p>
        </div>
      </div>
      <p class="crm-card__phone">${patient?.phone || "No phone on file"}</p>
      <div class="crm-card__tags">
        <span class="status-pill ${stage === "on-call" ? "ready" : "waiting"}">${a.telehealthStatus || "scheduled"}</span>
        ${pendingRx ? '<span class="crm-tag">Script review</span>' : ""}
        ${reorder ? '<span class="crm-tag crm-tag--alert">Reorder</span>' : ""}
      </div>
      <div class="crm-card__actions">
        ${
          stage !== "on-call"
            ? `<button class="button primary" type="button" data-start-call="${a.id}">Start call</button>`
            : `<button class="button ghost" type="button" data-open-detail="${patient?.id}">Open</button>`
        }
      </div>
    </article>
  `;
}

function renderBoard() {
  const items = filteredQueue();
  renderMetrics();

  Object.keys(STAGES).forEach((column) => {
    const list = document.querySelector(`[data-cards="${column}"]`);
    const columnItems = items.filter((item) => stageFor(item) === column);
    list.innerHTML = columnItems.length
      ? columnItems.map(cardHtml).join("")
      : `<p class="crm-column__empty">No patients here</p>`;
  });

  document.querySelectorAll("[data-card]").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      openDetail(card.dataset.patientId, card.dataset.appointmentId);
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") openDetail(card.dataset.patientId, card.dataset.appointmentId);
    });
  });

  document.querySelectorAll("[data-start-call]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      startCall(btn.dataset.startCall);
    });
  });

  document.querySelectorAll("[data-open-detail]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = btn.closest("[data-card]");
      openDetail(card.dataset.patientId, card.dataset.appointmentId);
    });
  });
}

async function loadQueue() {
  const data = await api("/api/doctor/queue");
  queue = data.queue || [];
  renderBoard();
  if (selectedId) {
    const item = queue.find((q) => q.patient?.id === selectedId);
    if (item) await openDetail(selectedId, item.appointment.id, { silent: true });
    else closeDetail();
  }
}

async function openDetail(patientId, appointmentId, opts = {}) {
  if (!patientId) return;
  selectedId = patientId;
  detailPanel.classList.add("is-open");
  detailEmpty.hidden = true;
  detailBody.hidden = false;

  const data = await api(`/api/doctor/patients/${patientId}`);
  const item = queue.find((q) => q.patient?.id === patientId);
  const apt = item?.appointment || data.appointments?.[0];

  document.querySelector("[data-detail-name]").textContent = data.patient.name;
  document.querySelector("[data-detail-meta]").textContent = `${data.patient.email} · ${data.patient.phone || "—"} · ${data.patient.state}`;
  document.querySelector("[data-detail-stage]").textContent = apt
    ? `${apt.date} ${apt.time} · ${apt.telehealthStatus || "scheduled"}`
    : "Patient record";

  document.querySelector("[data-detail-scripts]").innerHTML = data.prescriptions.length
    ? data.prescriptions
        .map(
          (r) =>
            `<li><strong>${r.name}</strong> — ${r.status} (${r.repeats}/${r.repeatsTotal} repeats)</li>`
        )
        .join("")
    : "<li>No scripts yet</li>";

  const stage = item ? stageFor(item) : "up-next";
  document.querySelector("[data-detail-actions]").innerHTML = `
    ${
      stage !== "on-call"
        ? `<button class="button primary" type="button" data-detail-call="${apt?.id || ""}">Start phone consult</button>`
        : `<a class="button primary" href="tel:${(data.patient.phone || "").replace(/\D/g, "")}">Dial ${data.patient.phone || "patient"}</a>`
    }
    ${
      apt?.telehealthStatus === "in_progress"
        ? `<button class="button ghost" type="button" data-detail-complete="${apt.id}">Mark complete</button>`
        : ""
    }
  `;

  document.querySelector("[data-detail-call]")?.addEventListener("click", () => startCall(apt.id));
  document.querySelector("[data-detail-complete]")?.addEventListener("click", () => completeCall(apt.id));

  const rx = data.prescriptions[0];
  if (rx) {
    scriptForm.hidden = false;
    newScriptBtn.hidden = true;
    scriptForm.prescriptionId.value = rx.id;
    scriptForm.patientId.value = patientId;
    scriptForm.appointmentId.value = appointmentId || "";
    scriptForm.name.value = rx.name;
    scriptForm.form.value = rx.form || "";
    scriptForm.repeats.value = rx.repeats;
    scriptForm.intervalDays.value = rx.intervalDays || 28;
    scriptForm.status.value = rx.status;
    scriptForm.notes.value = rx.notes || "";
  } else {
    scriptForm.hidden = true;
    newScriptBtn.hidden = false;
    newScriptBtn.onclick = () => showNewScript(patientId, appointmentId);
  }

  if (!opts.silent) renderBoard();
}

function closeDetail() {
  selectedId = null;
  detailPanel.classList.remove("is-open");
  detailEmpty.hidden = false;
  detailBody.hidden = true;
  renderBoard();
}

function showNewScript(patientId, appointmentId) {
  scriptForm.hidden = false;
  scriptForm.prescriptionId.value = "";
  scriptForm.patientId.value = patientId;
  scriptForm.appointmentId.value = appointmentId || "";
  scriptForm.reset();
  scriptForm.patientId.value = patientId;
  scriptForm.status.value = "pending_dispense";
  scriptForm.intervalDays.value = 28;
  scriptForm.repeats.value = 5;
}

async function startCall(appointmentId) {
  const res = await api("/api/telehealth/start", {
    method: "POST",
    body: JSON.stringify({ appointmentId }),
  });
  activeAppointmentId = appointmentId;
  callMsg.textContent = res.message;
  if (res.telLink) {
    callLink.href = res.telLink;
    callLink.hidden = false;
  } else {
    callLink.hidden = true;
  }
  callBanner.hidden = false;
  await loadQueue();
  const item = queue.find((q) => q.appointment.id === appointmentId);
  if (item?.patient?.id) await openDetail(item.patient.id, appointmentId, { silent: true });
}

async function completeCall(appointmentId) {
  await api("/api/telehealth/complete", {
    method: "POST",
    body: JSON.stringify({ appointmentId }),
  });
  if (activeAppointmentId === appointmentId) {
    callBanner.hidden = true;
    activeAppointmentId = null;
  }
  await loadQueue();
}

callDone?.addEventListener("click", async () => {
  if (!activeAppointmentId) return;
  await completeCall(activeAppointmentId);
});

scriptForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(scriptForm);
  const prescriptionId = fd.get("prescriptionId");
  const payload = {
    name: fd.get("name"),
    form: fd.get("form"),
    repeats: Number(fd.get("repeats")),
    repeatsTotal: Number(fd.get("repeats")),
    intervalDays: Number(fd.get("intervalDays")),
    status: fd.get("status"),
    notes: fd.get("notes"),
  };

  if (prescriptionId) {
    await api(`/api/prescriptions/${prescriptionId}`, { method: "PUT", body: JSON.stringify(payload) });
  } else {
    await api("/api/prescriptions", {
      method: "POST",
      body: JSON.stringify({ patientId: fd.get("patientId"), ...payload }),
    });
  }

  await loadQueue();
  await openDetail(fd.get("patientId"), fd.get("appointmentId"), { silent: true });
  alert("Script submitted to admin — it will appear in the patient portal once dispensed.");
});

const availabilityDate = document.querySelector("[data-availability-date]");
const availabilityGrid = document.querySelector("[data-availability-grid]");
const ALL_SLOTS = generateTimeSlots();
let selectedAvailability = new Set();

function showDoctorView(name) {
  document.querySelectorAll("[data-doctor-panel]").forEach((panel) => {
    const on = panel.dataset.doctorPanel === name;
    panel.hidden = !on;
  });
  document.querySelectorAll("[data-show-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.showView === name);
  });
  document.querySelector(".crm-header__intro h1").textContent =
    name === "calendar" ? "My availability" : "Consult pipeline";
  if (name === "calendar") loadAvailability();
}

async function loadAvailability() {
  if (!availabilityDate) return;
  if (!availabilityDate.value) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    availabilityDate.value = d.toISOString().slice(0, 10);
  }
  const data = await api(`/api/doctor/availability?date=${availabilityDate.value}`);
  selectedAvailability = new Set((data.slots || []).map((s) => s.time));
  renderAvailabilityGrid();
}

function renderAvailabilityGrid() {
  if (!availabilityGrid) return;
  availabilityGrid.innerHTML = ALL_SLOTS.map((time) => {
    const on = selectedAvailability.has(time);
    return `<label class="slot${on ? " is-open" : ""}">
      <input type="checkbox" value="${time}" ${on ? "checked" : ""} data-availability-slot />
      <span>${time}</span>
    </label>`;
  }).join("");
  availabilityGrid.querySelectorAll("[data-availability-slot]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) selectedAvailability.add(input.value);
      else selectedAvailability.delete(input.value);
      input.closest(".slot")?.classList.toggle("is-open", input.checked);
    });
  });
}

document.querySelectorAll("[data-show-view]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.showView === "pipeline") loadQueue();
    showDoctorView(btn.dataset.showView);
  });
});

availabilityDate?.addEventListener("change", loadAvailability);
document.querySelector("[data-save-availability]")?.addEventListener("click", async () => {
  await api("/api/doctor/availability", {
    method: "PUT",
    body: JSON.stringify({ date: availabilityDate.value, times: [...selectedAvailability] }),
  });
  alert("Availability saved — open slots are now bookable.");
});

loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const fd = new FormData(e.target);
  try {
    clearOtherPortalTokens("doctor");
    const res = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
    });
    if (!res.ok) throw new Error(res.error || "Login failed.");
    if (res.role !== "doctor" && res.role !== "admin") throw new Error("Doctor access only.");
    setToken(res.token);
    document.querySelector("[data-sidebar-name]").textContent = res.user.name;
    showApp();
    await loadQueue();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.hidden = false;
  }
});

document.querySelector("[data-logout]")?.addEventListener("click", showLogin);
document.querySelector("[data-close-detail]")?.addEventListener("click", closeDetail);
searchInput?.addEventListener("input", () => {
  searchQuery = searchInput.value;
  renderBoard();
});

if (getToken()) {
  api("/api/auth/me")
    .then(async (res) => {
      if (res.role !== "doctor" && res.role !== "admin") {
        setToken(null);
        loginError.textContent = "Signed in elsewhere as a different role. Please sign in as doctor.";
        loginError.hidden = false;
        throw new Error("wrong role");
      }
      document.querySelector("[data-sidebar-name]").textContent = res.user.name;
      showApp();
      await loadQueue();
    })
    .catch(showLogin);
} else {
  showLogin();
}