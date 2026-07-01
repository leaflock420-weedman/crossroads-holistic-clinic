import { api, setToken, getToken, configureAuth, clearOtherPortalTokens } from "./js/api.js";

configureAuth("admin");

const loginView = document.querySelector("[data-login-view]");
const appView = document.querySelector("[data-app-view]");
const loginForm = document.querySelector("[data-login-form]");
const loginError = document.querySelector("[data-login-error]");
const addPatientForm = document.querySelector("[data-add-patient-form]");
const addPatientResult = document.querySelector("[data-add-patient-result]");
const doctorSelects = () => document.querySelectorAll("[data-doctor-select]");

const TITLES = { dispense: "Dispense queue", patients: "Patients", appointments: "Appointments" };

let overview = null;

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
  document.querySelectorAll("[data-admin-view]").forEach((v) => {
    const on = v.dataset.adminView === name;
    v.classList.toggle("is-active", on);
    v.toggleAttribute("hidden", !on);
  });
  document.querySelectorAll("[data-admin-nav] button").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === name);
  });
  document.querySelector("[data-page-title]").textContent = TITLES[name] || name;
}

function patientName(id) {
  return overview?.patients?.find((p) => p.id === id)?.name || id;
}

function doctorName(id) {
  return overview?.doctors?.find((d) => d.id === id)?.name || "Unassigned";
}

function doctorOptions(selectedId = "") {
  return (overview?.doctors || [])
    .map((d) => `<option value="${d.id}" ${d.id === selectedId ? "selected" : ""}>${d.name}</option>`)
    .join("");
}

async function loadOverview() {
  overview = await api("/api/admin/overview");
  renderDispense();
  renderPatients();
  renderAppointments();
  doctorSelects().forEach((sel) => {
    const current = sel.value;
    sel.innerHTML = doctorOptions(current);
  });
}

function renderDispense() {
  const s = overview.stats;
  document.querySelector("[data-admin-stats]").innerHTML = `
    <article class="stat"><strong>${s.pendingDispense || 0}</strong><span>Awaiting dispense</span></article>
    <article class="stat"><strong>${s.reorderRequests}</strong><span>Reorder requests</span></article>
    <article class="stat"><strong>${s.patients}</strong><span>Patients</span></article>
    <article class="stat"><strong>${s.appointments}</strong><span>Appointments</span></article>
  `;

  const pending = overview.prescriptions.filter((r) => r.status === "pending_dispense" || r.status === "pending_review");
  document.querySelector("[data-dispense-list]").innerHTML = pending.length
    ? pending.map((r) => `
        <article class="queue-card">
          <div>
            <strong>${r.name}</strong>
            <p>${patientName(r.patientId)} · ${r.form}</p>
            <p class="queue-phone">${r.status === "pending_review" ? "Awaiting consult" : "Doctor submitted — ready to release"}</p>
          </div>
          <button class="button primary" type="button" data-dispense-rx="${r.id}">Dispense &amp; release to patient</button>
        </article>
      `).join("")
    : `<p class="empty-state">No scripts awaiting dispense.</p>`;

  const reorders = overview.prescriptions.filter((r) => r.status === "reorder_requested");
  document.querySelector("[data-reorder-list]").innerHTML = reorders.length
    ? reorders.map((r) => `
        <article class="queue-card">
          <div><strong>${r.name}</strong><p>${patientName(r.patientId)} · ${r.form}</p></div>
          <button class="button primary" type="button" data-dispense-rx="${r.id}">Approve reorder &amp; dispatch</button>
        </article>
      `).join("")
    : `<p class="empty-state">No pending reorder requests.</p>`;

  document.querySelectorAll("[data-dispense-rx]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/admin/prescriptions/${btn.dataset.dispenseRx}/dispense`, { method: "POST" });
      await loadOverview();
    });
  });
}

function renderPatients() {
  document.querySelector("[data-patients-table]").innerHTML = `
    <h3>All patients</h3>
    <table class="admin-table">
      <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Assigned doctor</th><th>Stage</th><th></th></tr></thead>
      <tbody>
        ${overview.patients.map((p) => `
          <tr data-patient-row="${p.id}">
            <td>${p.name}</td>
            <td>${p.email}</td>
            <td>${p.phone || "—"}</td>
            <td>
              <select class="admin-inline-select" data-assign-doctor="${p.id}">
                <option value="">— Unassigned —</option>
                ${doctorOptions(p.assignedDoctorId)}
              </select>
            </td>
            <td>${p.stage}</td>
            <td>
              <button class="button ghost" type="button" data-save-patient="${p.id}">Save</button>
              <button class="button ghost" type="button" data-call-patient="${p.id}">Call</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  document.querySelectorAll("[data-save-patient]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.savePatient;
      const doctorId = document.querySelector(`[data-assign-doctor="${id}"]`)?.value || null;
      await api(`/api/admin/patients/${id}`, {
        method: "PUT",
        body: JSON.stringify({ assignedDoctorId: doctorId || null }),
      });
      await loadOverview();
    });
  });

  document.querySelectorAll("[data-call-patient]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const patient = overview.patients.find((p) => p.id === btn.dataset.callPatient);
      const apt = overview.appointments.find((a) => a.patientId === patient.id);
      if (!apt) {
        if (patient.phone) window.location.href = `tel:${patient.phone.replace(/\D/g, "")}`;
        return;
      }
      const res = await api("/api/telehealth/start", {
        method: "POST",
        body: JSON.stringify({ appointmentId: apt.id }),
      });
      if (res.telLink) window.location.href = res.telLink;
      else alert(res.message);
      await loadOverview();
    });
  });
}

function renderAppointments() {
  document.querySelector("[data-appointments-table]").innerHTML = `
    <table class="admin-table">
      <thead><tr><th>Patient</th><th>When</th><th>Doctor</th><th>Duration</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${overview.appointments.map((a) => `
          <tr>
            <td>${patientName(a.patientId)}</td>
            <td>${a.date} ${a.time}</td>
            <td>${a.clinician || doctorName(a.doctorId)}</td>
            <td>${a.durationMinutes || 15} min</td>
            <td>${a.telehealthStatus || a.status}</td>
            <td><button class="button primary" type="button" data-start-apt="${a.id}">Start call</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  document.querySelectorAll("[data-start-apt]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const res = await api("/api/telehealth/start", {
        method: "POST",
        body: JSON.stringify({ appointmentId: btn.dataset.startApt }),
      });
      if (res.telLink) window.location.href = res.telLink;
      else alert(res.message);
      await loadOverview();
    });
  });
}

addPatientForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(addPatientForm);
  addPatientResult.hidden = true;
  try {
    const res = await api("/api/admin/patients", {
      method: "POST",
      body: JSON.stringify({
        name: fd.get("name"),
        email: fd.get("email"),
        phone: fd.get("phone"),
        state: fd.get("state"),
        support: fd.get("support"),
        assignedDoctorId: fd.get("assignedDoctorId"),
        password: fd.get("password") || undefined,
        paid: true,
      }),
    });
    addPatientResult.textContent = `Created ${res.patient.name}. Portal login: ${res.patient.email} / ${res.password}`;
    addPatientResult.hidden = false;
    addPatientForm.reset();
    await loadOverview();
    setView("patients");
  } catch (err) {
    addPatientResult.textContent = err.message;
    addPatientResult.hidden = false;
  }
});

loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const fd = new FormData(e.target);
  try {
    clearOtherPortalTokens("admin");
    const res = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
    });
    if (!res.ok) throw new Error(res.error || "Login failed.");
    if (res.role !== "admin") throw new Error("This account is not an admin.");
    setToken(res.token);
    document.querySelector("[data-sidebar-name]").textContent = res.user.name;
    showApp();
    await loadOverview();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.hidden = false;
  }
});

document.querySelector("[data-logout]")?.addEventListener("click", showLogin);
document.querySelectorAll("[data-admin-nav] button").forEach((btn) => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});

if (getToken()) {
  api("/api/auth/me")
    .then(async (res) => {
      if (res.role !== "admin") {
        setToken(null);
        throw new Error("wrong role");
      }
      document.querySelector("[data-sidebar-name]").textContent = res.user.name;
      showApp();
      await loadOverview();
    })
    .catch(showLogin);
} else {
  showLogin();
}