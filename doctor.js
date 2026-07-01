import { api, setToken, getToken } from "./js/api.js";

const loginView = document.querySelector("[data-login-view]");
const appView = document.querySelector("[data-app-view]");
const loginForm = document.querySelector("[data-login-form]");
const loginError = document.querySelector("[data-login-error]");
const queueList = document.querySelector("[data-queue-list]");
const patientPanel = document.querySelector("[data-patient-panel]");
const scriptForm = document.querySelector("[data-script-form]");
const newScriptBtn = document.querySelector("[data-new-script]");
const callBanner = document.querySelector("[data-call-banner]");
const callMsg = document.querySelector("[data-call-msg]");
const callLink = document.querySelector("[data-call-link]");
const callDone = document.querySelector("[data-call-done]");

let queue = [];
let selected = null;
let activeAppointmentId = null;

function showLogin() {
  setToken(null);
  loginView.hidden = false;
  appView.hidden = true;
}

function showApp() {
  loginView.hidden = true;
  appView.hidden = false;
}

function setView(name) {
  document.querySelectorAll("[data-staff-view]").forEach((v) => {
    const on = v.dataset.staffView === name;
    v.classList.toggle("is-active", on);
    v.toggleAttribute("hidden", !on);
  });
  document.querySelectorAll("[data-staff-nav] button").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === name);
  });
}

async function loadQueue() {
  const data = await api("/api/doctor/queue");
  queue = data.queue || [];
  renderQueue();
}

function renderQueue() {
  if (!queue.length) {
    queueList.innerHTML = `<p class="empty-state">No upcoming consults in queue.</p>`;
    return;
  }

  queueList.innerHTML = queue.map(({ appointment: a, patient }) => `
    <article class="queue-card">
      <div>
        <p class="eyebrow">${a.type}</p>
        <h3>${patient?.name || "Patient"}</h3>
        <p>${a.date} at ${a.time} · ${a.format}</p>
        <p class="queue-phone">${patient?.phone || "No phone on file"}</p>
      </div>
      <div class="queue-actions">
        <span class="status-pill ${a.telehealthStatus === "in_progress" ? "ready" : "waiting"}">${a.telehealthStatus || "scheduled"}</span>
        <button class="button primary" type="button" data-start-call="${a.id}" data-patient-id="${patient?.id}">Start phone consult</button>
        <button class="button ghost" type="button" data-open-patient="${patient?.id}">Scripts</button>
      </div>
    </article>
  `).join("");

  queueList.querySelectorAll("[data-start-call]").forEach((btn) => {
    btn.addEventListener("click", () => startCall(btn.dataset.startCall));
  });
  queueList.querySelectorAll("[data-open-patient]").forEach((btn) => {
    btn.addEventListener("click", () => openPatient(btn.dataset.openPatient));
  });
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
}

callDone?.addEventListener("click", async () => {
  if (!activeAppointmentId) return;
  await api("/api/telehealth/complete", {
    method: "POST",
    body: JSON.stringify({ appointmentId: activeAppointmentId }),
  });
  callBanner.hidden = true;
  activeAppointmentId = null;
  await loadQueue();
});

async function openPatient(patientId) {
  const data = await api(`/api/doctor/patients/${patientId}`);
  selected = data;
  setView("patient");

  const rx = data.prescriptions[0];
  patientPanel.innerHTML = `
    <h3>${data.patient.name}</h3>
    <p>${data.patient.email} · ${data.patient.phone || "—"} · ${data.patient.state}</p>
    <p><strong>Support:</strong> ${data.patient.support || "—"}</p>
    <h4>Scripts on file</h4>
    <ul class="script-mini-list">
      ${data.prescriptions.map((r) => `<li><strong>${r.name}</strong> — ${r.status} (${r.repeats}/${r.repeatsTotal} repeats)</li>`).join("") || "<li>None yet</li>"}
    </ul>
  `;

  if (rx) {
    scriptForm.hidden = false;
    newScriptBtn.hidden = true;
    scriptForm.prescriptionId.value = rx.id;
    scriptForm.patientId.value = patientId;
    scriptForm.name.value = rx.name;
    scriptForm.form.value = rx.form || "";
    scriptForm.repeats.value = rx.repeats;
    scriptForm.intervalDays.value = rx.intervalDays || 28;
    scriptForm.status.value = rx.status;
    scriptForm.notes.value = rx.notes || "";
  } else {
    scriptForm.hidden = true;
    newScriptBtn.hidden = false;
    newScriptBtn.onclick = () => showNewScript(patientId);
  }
}

function showNewScript(patientId) {
  scriptForm.hidden = false;
  scriptForm.prescriptionId.value = "";
  scriptForm.patientId.value = patientId;
  scriptForm.reset();
  scriptForm.patientId.value = patientId;
  scriptForm.status.value = "active";
  scriptForm.intervalDays.value = 28;
  scriptForm.repeats.value = 5;
}

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

  await openPatient(fd.get("patientId"));
  alert("Script saved — patient will see it in their portal.");
});

loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const res = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
    });
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
document.querySelectorAll("[data-staff-nav] button").forEach((btn) => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});

if (getToken()) {
  api("/api/auth/me")
    .then(async (res) => {
      if (res.role !== "doctor" && res.role !== "admin") throw new Error();
      document.querySelector("[data-sidebar-name]").textContent = res.user.name;
      showApp();
      await loadQueue();
    })
    .catch(showLogin);
} else {
  showLogin();
}