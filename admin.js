import { api, setToken, getToken, configureAuth, clearOtherPortalTokens } from "./js/api.js";

configureAuth("admin");

const loginView = document.querySelector("[data-login-view]");
const appView = document.querySelector("[data-app-view]");
const loginForm = document.querySelector("[data-login-form]");
const loginError = document.querySelector("[data-login-error]");

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
  document.querySelector("[data-page-title]").textContent =
    name.charAt(0).toUpperCase() + name.slice(1);
}

function patientName(id) {
  return overview?.patients?.find((p) => p.id === id)?.name || id;
}

async function loadOverview() {
  overview = await api("/api/admin/overview");
  renderOverview();
  renderPatients();
  renderScripts();
  renderAppointments();
}

function renderOverview() {
  const s = overview.stats;
  document.querySelector("[data-admin-stats]").innerHTML = `
    <article class="stat"><strong>${s.patients}</strong><span>Patients</span></article>
    <article class="stat"><strong>${s.appointments}</strong><span>Appointments</span></article>
    <article class="stat"><strong>${s.reorderRequests}</strong><span>Reorder requests</span></article>
    <article class="stat"><strong>${s.orders}</strong><span>Product orders</span></article>
  `;

  const reorders = overview.prescriptions.filter((r) => r.status === "reorder_requested");
  document.querySelector("[data-reorder-list]").innerHTML = reorders.length
    ? reorders.map((r) => `
        <article class="queue-card">
          <div><strong>${r.name}</strong><p>${patientName(r.patientId)} · ${r.form}</p></div>
          <button class="button primary" type="button" data-approve-rx="${r.id}">Approve &amp; dispatch</button>
        </article>
      `).join("")
    : `<p class="empty-state">No pending reorder requests.</p>`;

  document.querySelectorAll("[data-approve-rx]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/prescriptions/${btn.dataset.approveRx}`, {
        method: "PUT",
        body: JSON.stringify({ status: "active" }),
      });
      await loadOverview();
    });
  });
}

function renderPatients() {
  document.querySelector("[data-patients-table]").innerHTML = `
    <table class="admin-table">
      <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Stage</th><th></th></tr></thead>
      <tbody>
        ${overview.patients.map((p) => `
          <tr>
            <td>${p.name}</td>
            <td>${p.email}</td>
            <td>${p.phone || "—"}</td>
            <td>${p.stage}</td>
            <td><button class="button ghost" type="button" data-call-patient="${p.id}">Call</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  document.querySelectorAll("[data-call-patient]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const patient = overview.patients.find((p) => p.id === btn.dataset.callPatient);
      const apt = overview.appointments.find((a) => a.patientId === patient.id);
      if (!apt) {
        alert(`No appointment — call ${patient.name} at ${patient.phone}`);
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

function renderScripts() {
  document.querySelector("[data-scripts-table]").innerHTML = `
    <table class="admin-table">
      <thead><tr><th>Patient</th><th>Script</th><th>Status</th><th>Repeats</th><th></th></tr></thead>
      <tbody>
        ${overview.prescriptions.map((r) => `
          <tr>
            <td>${patientName(r.patientId)}</td>
            <td>${r.name}<br><small>${r.form}</small></td>
            <td>${r.status}</td>
            <td>${r.repeats}/${r.repeatsTotal}</td>
            <td>
              <button class="button ghost" type="button" data-edit-rx="${r.id}">Quick activate</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  document.querySelectorAll("[data-edit-rx]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/prescriptions/${btn.dataset.editRx}`, {
        method: "PUT",
        body: JSON.stringify({ status: "active", repeats: 5, repeatsTotal: 5, intervalDays: 28 }),
      });
      await loadOverview();
      alert("Script activated — patient can view in portal.");
    });
  });
}

function renderAppointments() {
  document.querySelector("[data-appointments-table]").innerHTML = `
    <table class="admin-table">
      <thead><tr><th>Patient</th><th>When</th><th>Clinician</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${overview.appointments.map((a) => `
          <tr>
            <td>${patientName(a.patientId)}</td>
            <td>${a.date} ${a.time}</td>
            <td>${a.clinician}</td>
            <td>${a.telehealthStatus || a.status}</td>
            <td>
              <button class="button primary" type="button" data-start-apt="${a.id}">Start call</button>
            </td>
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
    if (res.role !== "admin") throw new Error("This account is not an admin. Use the doctor or patient portal instead.");
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
        loginError.textContent = "Signed in elsewhere as a different role. Please sign in as admin.";
        loginError.hidden = false;
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