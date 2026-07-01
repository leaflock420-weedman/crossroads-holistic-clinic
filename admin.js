import { TIME_SLOTS } from "./js/data.js";
import { api, setToken, getToken, configureAuth, clearOtherPortalTokens } from "./js/api.js";
import { notifyClinicUpdate, onClinicUpdate, startPolling } from "./js/sync.js";
import { mountConnectionBanner } from "./js/connection.js";

configureAuth("admin");

const loginView = document.querySelector("[data-login-view]");
const appView = document.querySelector("[data-app-view]");
const loginForm = document.querySelector("[data-login-form]");
const loginError = document.querySelector("[data-login-error]");
const addPatientForm = document.querySelector("[data-add-patient-form]");
const addPatientResult = document.querySelector("[data-add-patient-result]");
const doctorSelects = () => document.querySelectorAll("[data-doctor-select]");

const TITLES = {
  dispense: "Approve queue",
  orders: "Product orders",
  patients: "Patients",
  appointments: "Appointments",
};

let overview = null;
let stopPolling = null;
let unsubscribeClinic = null;
let activeView = "dispense";

function showLogin() {
  stopPolling?.();
  unsubscribeClinic?.();
  setToken(null);
  loginView.hidden = false;
  appView.hidden = true;
}

function showApp() {
  loginView.hidden = true;
  appView.hidden = false;
  stopPolling?.();
  unsubscribeClinic?.();
  stopPolling = startPolling(() => loadOverview(), 2500);
  unsubscribeClinic = onClinicUpdate(() => loadOverview());
  mountConnectionBanner(document.querySelector(".portal-main"));
}

function setView(name) {
  activeView = name;
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

function timeSlotOptions(selected = "") {
  return TIME_SLOTS.map((t) => `<option value="${t}" ${t === selected ? "selected" : ""}>${t}</option>`).join("");
}

function formatSubmitted(rx) {
  if (!rx.submittedAt) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(rx.submittedAt).getTime()) / 60000));
  return mins < 1 ? "Just now" : `${mins} min ago`;
}

function isEditingSection(selector) {
  const root = document.querySelector(selector);
  return Boolean(root?.contains(document.activeElement));
}

async function loadOverview(opts = {}) {
  overview = await api("/api/admin/overview");
  renderApproveQueue();
  renderOrders();

  const editingPatients = isEditingSection("[data-patients-table]");
  const editingAppointments = isEditingSection("[data-appointments-table]");

  if (opts.forcePatients || (activeView === "patients" && !editingPatients) || !document.querySelector("[data-patients-table] tbody")) {
    renderPatients();
  }
  if (opts.forceAppointments || (activeView === "appointments" && !editingAppointments) || !document.querySelector("[data-appointments-table] tbody tr")) {
    renderAppointments();
  }

  doctorSelects().forEach((sel) => {
    const current = sel.value;
    sel.innerHTML = `<option value="">— Select doctor —</option>${doctorOptions(current)}`;
  });
}

function changeReasonLabel(reason) {
  const map = {
    out_of_stock: "Out of stock",
    side_effects: "Side effects",
    preference: "Patient preference",
    other: "Other",
  };
  return map[reason] || reason || "Change requested";
}

function renderChangeRequests() {
  const el = document.querySelector("[data-change-requests-list]");
  if (!el) return;
  const incoming = (overview.changeRequests || []).filter((c) => c.status === "pending");
  const withDoctor = (overview.changeRequests || []).filter((c) => c.status === "with_doctor");

  if (!incoming.length && !withDoctor.length) {
    el.innerHTML = `<p class="empty-state">No medication change requests. Patient requests from the portal appear here instantly.</p>`;
    return;
  }

  el.innerHTML = `
    ${incoming.length ? `<h4>New from patients</h4>` : ""}
    ${
      incoming.length
        ? incoming
            .map(
              (c) => `
        <article class="queue-card queue-card--fresh" data-change-row="${c.id}">
          <div>
            <strong>${patientName(c.patientId)}</strong>
            <p>${c.currentName} · ${c.currentForm}</p>
            <p>Requested: <strong>${c.requestedProduct || "Alternative"}</strong> · ${c.requestedForm || "—"}</p>
            <p class="queue-phone">${changeReasonLabel(c.reason)} · ${c.notes || ""}</p>
          </div>
          <div class="queue-card__actions">
            <select class="admin-inline-select" data-forward-doctor="${c.id}">
              <option value="">Select doctor</option>
              ${doctorOptions(
                overview.patients.find((p) => p.id === c.patientId)?.assignedDoctorId || ""
              )}
            </select>
            <button class="button primary" type="button" data-forward-change="${c.id}">Send to doctor</button>
          </div>
        </article>`
            )
            .join("")
        : ""
    }
    ${
      withDoctor.length
        ? `<h4>Awaiting doctor approval</h4>${withDoctor
            .map(
              (c) => `
        <article class="queue-card">
          <div>
            <strong>${patientName(c.patientId)}</strong>
            <p>${c.currentName} → ${c.requestedProduct || c.requestedForm}</p>
            <p class="queue-phone">With ${doctorName(c.assignedDoctorId)} · doctor approves → script hits approval queue</p>
          </div>
          <span class="crm-tag">With doctor</span>
        </article>`
            )
            .join("")}`
        : ""
    }
  `;

  el.querySelectorAll("[data-forward-change]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.forwardChange;
      const doctorId = document.querySelector(`[data-forward-doctor="${id}"]`)?.value;
      if (!doctorId) {
        alert("Select which doctor should approve this change.");
        return;
      }
      await api(`/api/admin/change-requests/${id}/forward`, {
        method: "POST",
        body: JSON.stringify({ doctorId }),
      });
      notifyClinicUpdate();
      await loadOverview();
    });
  });
}

function renderApproveQueue() {
  const s = overview.stats;
  document.querySelector("[data-admin-stats]").innerHTML = `
    <article class="stat"><strong>${s.pendingDispense || 0}</strong><span>Awaiting approval</span></article>
    <article class="stat"><strong>${s.reorderRequests}</strong><span>Reorder requests</span></article>
    <article class="stat"><strong>${s.changeRequests || 0}</strong><span>New change requests</span></article>
    <article class="stat"><strong>${s.changeRequestsWithDoctor || 0}</strong><span>With doctor</span></article>
  `;

  renderChangeRequests();

  const pending = overview.prescriptions
    .filter((r) => r.status === "pending_dispense")
    .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

  document.querySelector("[data-dispense-list]").innerHTML = pending.length
    ? pending
        .map(
          (r) => `
        <article class="queue-card queue-card--fresh">
          <div>
            <strong>${r.name}</strong>
            <p>${patientName(r.patientId)} · ${r.form}</p>
            <p class="queue-phone">Doctor submitted ${formatSubmitted(r)} · ${r.supplyDays || 30}-day supply · interval ${r.intervalDays || 30}d</p>
          </div>
          <button class="button primary" type="button" data-approve-rx="${r.id}">Approve &amp; send eRx</button>
        </article>
      `
        )
        .join("")
    : `<p class="empty-state">No scripts awaiting approval. Doctor submissions appear here instantly.</p>`;

  const awaitingConsult = overview.prescriptions.filter((r) => r.status === "pending_review");
  if (awaitingConsult.length) {
    document.querySelector("[data-dispense-list]").innerHTML += `
      <h4>Awaiting consult</h4>
      ${awaitingConsult
        .map(
          (r) => `
        <article class="queue-card">
          <div><strong>${r.name}</strong><p>${patientName(r.patientId)} — placeholder until consult</p></div>
        </article>`
        )
        .join("")}
    `;
  }

  const reorders = overview.prescriptions.filter((r) => r.status === "reorder_requested");
  document.querySelector("[data-reorder-list]").innerHTML = reorders.length
    ? reorders
        .map(
          (r) => `
        <article class="queue-card">
          <div><strong>${r.name}</strong><p>${patientName(r.patientId)} · ${r.form}</p></div>
          <button class="button primary" type="button" data-approve-rx="${r.id}">Approve reorder &amp; send eRx</button>
        </article>
      `
        )
        .join("")
    : `<p class="empty-state">No pending reorder requests.</p>`;

  document.querySelectorAll("[data-approve-rx]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const res = await api(`/api/admin/prescriptions/${btn.dataset.approveRx}/approve`, { method: "POST" });
      const url = res.erx?.ausscriptsUrl || res.prescription?.ausscriptsUrl;
      notifyClinicUpdate();
      alert(
        `Approved and sent via eRx.\n\nPatient link:\n${url || res.erx?.erxToken || "check portal"}`
      );
      await loadOverview();
    });
  });
}

function deliveryLabel(method) {
  if (method === "signature") return "Registered post + signature ($25)";
  if (method === "post") return "Postage ($20)";
  return "Local pharmacy pickup";
}

function renderOrders() {
  const orders = (overview.orders || []).sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );
  const el = document.querySelector("[data-orders-list]");
  if (!el) return;
  el.innerHTML = orders.length
    ? orders
        .map((o) => {
          const items = (o.items || [])
            .map((i) => `${i.name} × ${i.qty}`)
            .join(", ");
          return `
        <article class="queue-card queue-card--fresh">
          <div>
            <strong>${patientName(o.patientId)}</strong>
            <p>${items}</p>
            <p class="queue-phone">${deliveryLabel(o.delivery)} · $${Number(o.total || 0).toFixed(2)} · ${o.status}</p>
          </div>
          <div class="queue-card__actions">
            ${
              o.status === "processing"
                ? `<button class="button primary" type="button" data-fulfill-order="${o.id}">Mark shipped</button>`
                : `<span class="crm-tag">${o.status}</span>`
            }
          </div>
        </article>`;
        })
        .join("")
    : `<p class="empty-state">No product orders yet. Patient cart checkouts appear here instantly.</p>`;

  el.querySelectorAll("[data-fulfill-order]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/admin/orders/${btn.dataset.fulfillOrder}`, {
        method: "PUT",
        body: JSON.stringify({ status: "shipped" }),
      });
      notifyClinicUpdate();
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
        ${overview.patients
          .map(
            (p) => `
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
        `
          )
          .join("")}
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
      notifyClinicUpdate();
      await loadOverview({ forcePatients: true });
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
  const patients = overview.patients.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
  document.querySelector("[data-appointments-table]").innerHTML = `
    <div class="admin-panel">
      <h3>Schedule doctor call</h3>
      <form class="flow-form admin-form-grid" data-schedule-apt-form>
        <label>Patient <select name="patientId" required><option value="">Select patient</option>${patients}</select></label>
        <label>Doctor <select name="doctorId" data-doctor-select required>${doctorOptions()}</select></label>
        <label>Date <input type="date" name="date" required data-schedule-date /></label>
        <label>Time <select name="time" required data-schedule-time><option value="">Select date &amp; doctor first</option></select></label>
        <label>Visit type
          <select name="patientType">
            <option value="existing">Returning · 15 min</option>
            <option value="new">New patient · 30 min</option>
          </select>
        </label>
        <button class="button primary" type="submit">Schedule call</button>
      </form>
    </div>
    <table class="admin-table">
      <thead><tr><th>Patient</th><th>When</th><th>Doctor</th><th>Duration</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${overview.appointments
          .map((a) => {
            const typeLabel = a.patientType === "new" || /initial/i.test(a.type || "") ? "New" : "Returning";
            return `
          <tr data-apt-row="${a.id}">
            <td>${patientName(a.patientId)}</td>
            <td>
              <input class="admin-inline-input" type="date" value="${a.date}" data-apt-date="${a.id}" />
              <select class="admin-inline-select" data-apt-time="${a.id}">${timeSlotOptions(a.time)}</select>
            </td>
            <td>
              <select class="admin-inline-select" data-apt-doctor="${a.id}">
                <option value="">— Unassigned —</option>
                ${doctorOptions(a.doctorId)}
              </select>
            </td>
            <td>${a.durationMinutes || 15} min · ${typeLabel}</td>
            <td>${a.telehealthStatus || a.status}</td>
            <td>
              <button class="button ghost" type="button" data-save-apt="${a.id}">Save</button>
              <button class="button primary" type="button" data-start-apt="${a.id}">Start call</button>
              ${
                a.status !== "cancelled"
                  ? `<button class="button ghost" type="button" data-cancel-apt="${a.id}">Cancel</button>`
                  : ""
              }
            </td>
          </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;

  document.querySelectorAll("[data-save-apt]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.saveApt;
      try {
        await api(`/api/admin/appointments/${id}`, {
          method: "PUT",
          body: JSON.stringify({
            date: document.querySelector(`[data-apt-date="${id}"]`)?.value,
            time: document.querySelector(`[data-apt-time="${id}"]`)?.value,
            doctorId: document.querySelector(`[data-apt-doctor="${id}"]`)?.value || null,
          }),
        });
        notifyClinicUpdate();
        await loadOverview({ forceAppointments: true });
      } catch (err) {
        alert(err.message);
      }
    });
  });

  document.querySelector("[data-schedule-apt-form]")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const patientType = fd.get("patientType");
    await api("/api/admin/appointments", {
      method: "POST",
      body: JSON.stringify({
        patientId: fd.get("patientId"),
        doctorId: fd.get("doctorId"),
        date: fd.get("date"),
        time: fd.get("time"),
        patientType,
        durationMinutes: patientType === "new" ? 30 : 15,
        type: patientType === "new" ? "Initial consult" : "Follow-up consult",
      }),
    });
    e.target.reset();
    notifyClinicUpdate();
    await loadOverview();
    setView("appointments");
  });

  document.querySelectorAll("[data-cancel-apt]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Cancel this appointment?")) return;
      await api(`/api/admin/appointments/${btn.dataset.cancelApt}/cancel`, { method: "POST" });
      notifyClinicUpdate();
      await loadOverview();
    });
  });

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
  btn.addEventListener("click", () => {
    setView(btn.dataset.view);
    if (btn.dataset.view === "patients") loadOverview({ forcePatients: true });
    if (btn.dataset.view === "appointments") loadOverview({ forceAppointments: true });
  });
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