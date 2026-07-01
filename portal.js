import { PRODUCTS } from "./js/data.js";
import { api, setToken, getToken, configureAuth, clearOtherPortalTokens, isReorderReady, daysUntilReorder, isDemoMode } from "./js/api.js";

configureAuth("patient");

const loginView = document.querySelector("[data-login-view]");
const appView = document.querySelector("[data-app-view]");
const loginForm = document.querySelector("[data-login-form]");
const loginError = document.querySelector("[data-login-error]");
const nav = document.querySelector("[data-portal-nav]");
const bottomNav = document.querySelector("[data-bottom-nav]");
const sidebar = document.querySelector("[data-sidebar]");
const views = Array.from(document.querySelectorAll("[data-portal-view]"));
const pageTitle = document.querySelector("[data-page-title]");
const pageEyebrow = document.querySelector("[data-page-eyebrow]");
const headerName = document.querySelector("[data-header-name]");
const changeDialog = document.querySelector("[data-change-dialog]");
const changeForm = document.querySelector("[data-change-form]");

const TITLES = {
  overview: "Overview",
  scripts: "My scripts",
  appointments: "Appointments",
  products: "Products",
  profile: "Profile",
};

let patientData = null;
let cart = [];

function visiblePrescriptions(list) {
  return (list || []).filter((r) => r.status === "active" || r.status === "reorder_requested");
}

function pendingChangeFor(rxId) {
  return (patientData?.changeRequests || []).find((c) => c.prescriptionId === rxId && c.status === "pending");
}

function showLogin(clear = true) {
  if (clear) setToken(null);
  loginView.hidden = false;
  appView.hidden = true;
}

function showApp() {
  loginView.hidden = true;
  appView.hidden = false;
  let banner = document.querySelector("[data-demo-banner]");
  if (isDemoMode()) {
    if (!banner) {
      banner = document.createElement("p");
      banner.dataset.demoBanner = "";
      banner.className = "demo-mode-banner";
      banner.textContent = "Demo mode — using local data until live API connects.";
      appView.querySelector(".patient-main")?.prepend(banner);
    }
    banner.hidden = false;
  } else if (banner) {
    banner.hidden = true;
  }
}

function setView(name) {
  views.forEach((v) => {
    const on = v.dataset.portalView === name;
    v.classList.toggle("is-active", on);
    v.toggleAttribute("hidden", !on);
  });
  nav?.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  bottomNav?.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  if (pageTitle) pageTitle.textContent = TITLES[name] || "Portal";
  if (pageEyebrow) pageEyebrow.textContent = patientData?.patient?.name || "Welcome back";
  sidebar?.classList.remove("is-open");
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function renderOverview() {
  const stats = document.querySelector("[data-overview-stats]");
  const quick = document.querySelector("[data-quick-actions]");
  const nextApt = document.querySelector("[data-next-appointment]");
  const scriptSum = document.querySelector("[data-script-summary]");
  const { appointments, prescriptions, orders } = patientData;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = appointments.find((a) => a.date >= today && a.status !== "completed");
  const visible = visiblePrescriptions(prescriptions);
  const activeRx = visible.filter((r) => r.status === "active");
  const readyRx = activeRx.filter(isReorderReady);
  const pendingChanges = (patientData.changeRequests || []).filter((c) => c.status === "pending").length;

  stats.innerHTML = `
    <article class="patient-stat"><strong>${activeRx.length}</strong><span>Active scripts</span></article>
    <article class="patient-stat"><strong>${readyRx.length}</strong><span>Ready to reorder</span></article>
    <article class="patient-stat"><strong>${upcoming ? 1 : 0}</strong><span>Upcoming visit</span></article>
    <article class="patient-stat"><strong>${orders.length}</strong><span>Orders</span></article>
  `;

  quick.innerHTML = `
    <button type="button" class="patient-quick-btn" data-go-view="scripts">View scripts</button>
    <button type="button" class="patient-quick-btn" data-go-view="appointments">Appointments</button>
    ${readyRx.length ? `<button type="button" class="patient-quick-btn patient-quick-btn--accent" data-go-view="scripts">Reorder now</button>` : ""}
    ${pendingChanges ? `<span class="patient-quick-note">${pendingChanges} change request awaiting clinician</span>` : ""}
  `;
  quick.querySelectorAll("[data-go-view]").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.goView));
  });

  if (upcoming) {
    const mins = upcoming.durationMinutes || 15;
    nextApt.innerHTML = `
      <p class="eyebrow">Next consult</p>
      <h3>${formatDate(upcoming.date)} · ${upcoming.time}</h3>
      <p>${upcoming.clinician} · ${upcoming.format} · ${mins} min</p>
      <span class="status-pill confirmed">${upcoming.telehealthStatus || upcoming.status}</span>
    `;
  } else {
    nextApt.innerHTML = `<p class="eyebrow">Next consult</p><h3>No booking yet</h3><p><a href="/start.html">Book a consult</a></p>`;
  }

  const rx = visible[0];
  if (!rx) {
    scriptSum.innerHTML = `<p class="eyebrow">Scripts</p><h3>None released yet</h3><p>Your clinician will publish scripts after review and admin dispense.</p>`;
    return;
  }

  const ready = isReorderReady(rx);
  scriptSum.innerHTML = `
    <p class="eyebrow">Primary script</p>
    <h3>${rx.name}</h3>
    <p>${rx.form}</p>
    <span class="status-pill ${ready ? "ready" : "waiting"}">${ready ? "Ready to reorder" : `Reorder in ${daysUntilReorder(rx)} days`}</span>
  `;
}

function renderScripts() {
  const list = document.querySelector("[data-script-list]");
  const prescriptions = visiblePrescriptions(patientData.prescriptions);

  if (!prescriptions.length) {
    list.innerHTML = `<p class="empty-state">No released scripts yet. After your consult, your clinician submits your script and admin dispenses it — then it appears here.</p>`;
    return;
  }

  list.innerHTML = prescriptions.map((rx) => {
    const ready = isReorderReady(rx);
    const days = daysUntilReorder(rx);
    const statusClass = ready ? "ready" : rx.status === "reorder_requested" ? "pending" : "waiting";
    const statusText =
      rx.status === "reorder_requested"
        ? "Reorder requested — awaiting dispense"
        : ready
          ? "Ready to reorder"
          : `Reorder in ${days} day${days === 1 ? "" : "s"}`;
    const change = pendingChangeFor(rx.id);

    return `<article class="script-card">
      <header>
        <div><h3>${rx.name}</h3><p>${rx.form}</p></div>
        <span class="status-pill ${statusClass}">${statusText}</span>
      </header>
      <dl class="script-meta">
        <div><dt>Prescribed</dt><dd>${rx.prescribedAt ? formatDate(rx.prescribedAt) : "—"}</dd></div>
        <div><dt>Repeats</dt><dd>${rx.repeats} / ${rx.repeatsTotal}</dd></div>
        <div><dt>Interval</dt><dd>Every ${rx.intervalDays || 28} days</dd></div>
        <div><dt>Next reorder</dt><dd>${rx.nextReorderAt ? formatDate(rx.nextReorderAt) : "TBC"}</dd></div>
      </dl>
      ${rx.erxToken ? `<div class="erx-token-card"><p class="eyebrow">eRx token</p><p class="erx-token">${rx.erxToken}</p><p><a href="${rx.ausscriptsUrl || "https://ausscripts.erx.com.au/"}" target="_blank" rel="noopener">Order via AusScripts</a> or present at pharmacy.</p></div>` : ""}
      <div class="script-card__actions">
        ${ready ? `<button type="button" class="button primary" data-reorder="${rx.id}">Request reorder</button>` : ""}
        ${change ? `<span class="status-pill pending">Change request pending</span>` : `<button type="button" class="button ghost" data-request-change="${rx.id}">Request medication change</button>`}
      </div>
    </article>`;
  }).join("");

  list.querySelectorAll("[data-reorder]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api(`/api/patient/reorder/${btn.dataset.reorder}`, { method: "POST" });
        await refresh();
        setView("scripts");
      } catch (err) {
        alert(err.message);
      }
    });
  });

  list.querySelectorAll("[data-request-change]").forEach((btn) => {
    btn.addEventListener("click", () => openChangeDialog(btn.dataset.requestChange));
  });
}

function openChangeDialog(prescriptionId) {
  if (!changeDialog || !changeForm) return;
  changeForm.prescriptionId.value = prescriptionId;
  changeDialog.showModal();
}

changeForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(changeForm);
  try {
    await api(`/api/patient/prescriptions/${fd.get("prescriptionId")}/change-request`, {
      method: "POST",
      body: JSON.stringify({
        requestedForm: fd.get("requestedForm"),
        requestedProduct: fd.get("requestedProduct"),
        reason: fd.get("reason"),
        notes: fd.get("notes"),
      }),
    });
    changeDialog.close();
    await refresh();
    setView("scripts");
    alert("Change request sent to your clinician.");
  } catch (err) {
    alert(err.message);
  }
});

document.querySelector("[data-change-cancel]")?.addEventListener("click", () => changeDialog?.close());

function renderAppointments() {
  const list = document.querySelector("[data-appointment-list]");
  const { appointments } = patientData;

  if (!appointments.length) {
    list.innerHTML = `<p class="empty-state">No appointments yet. <a href="/start.html">Book your consult</a></p>`;
    return;
  }

  list.innerHTML = appointments
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
    .map((a) => {
      const mins = a.durationMinutes || (a.patientType === "new" ? 30 : 15);
      const typeLabel = a.patientType === "new" || /initial/i.test(a.type || "") ? "New patient" : "Returning";
      return `<article class="apt-card">
        <div>
          <p class="eyebrow">${a.type || "Consult"} · ${typeLabel}</p>
          <h3>${formatDate(a.date)} at ${a.time}</h3>
          <p>${a.clinician} · ${a.format} · ${mins} min</p>
        </div>
        <div class="apt-card__side">
          <span class="status-pill confirmed">${a.telehealthStatus || a.status}</span>
          <strong>$${a.fee || 49}.00</strong>
        </div>
      </article>`;
    })
    .join("");
}

function renderProducts() {
  const grid = document.querySelector("[data-product-grid]");
  grid.innerHTML = PRODUCTS.map((p) => `
    <article class="product-card">
      <div class="product-card__icon">${p.image}</div>
      <p class="eyebrow">${p.category}</p>
      <h3>${p.name}</h3>
      <p>${p.desc}</p>
      <div class="product-card__foot">
        <strong>$${p.price.toFixed(2)}</strong>
        <button type="button" class="button ghost" data-add-product="${p.id}">Add</button>
      </div>
    </article>
  `).join("");

  grid.querySelectorAll("[data-add-product]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const product = PRODUCTS.find((p) => p.id === btn.dataset.addProduct);
      const existing = cart.find((c) => c.id === product.id);
      if (existing) existing.qty++;
      else cart.push({ ...product, qty: 1 });
      renderCart();
    });
  });
  renderCart();
}

function renderCart() {
  const panel = document.querySelector("[data-cart-panel]");
  const items = document.querySelector("[data-cart-items]");
  const total = document.querySelector("[data-cart-total]");
  if (!cart.length) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  items.innerHTML = cart.map((c) => `<div class="cart-line"><span>${c.name} × ${c.qty}</span><strong>$${(c.price * c.qty).toFixed(2)}</strong></div>`).join("");
  const sum = cart.reduce((s, c) => s + c.price * c.qty, 0);
  total.innerHTML = `<span>Total</span><strong>$${sum.toFixed(2)} AUD</strong>`;
}

function renderProfile() {
  const list = document.querySelector("[data-profile-list]");
  const { patient } = patientData;
  list.innerHTML = `
    <div><dt>Name</dt><dd>${patient.name}</dd></div>
    <div><dt>Email</dt><dd>${patient.email}</dd></div>
    <div><dt>Phone</dt><dd>${patient.phone || "—"}</dd></div>
    <div><dt>State</dt><dd>${patient.state}</dd></div>
    <div><dt>Support focus</dt><dd>${patient.support || "—"}</dd></div>
    <div><dt>Status</dt><dd>${patient.stage}</dd></div>
  `;
}

async function refresh() {
  patientData = await api("/api/patient/dashboard");
  const name = patientData.patient.name;
  document.querySelector("[data-sidebar-name]")?.replaceChildren(document.createTextNode(name));
  if (headerName) headerName.textContent = name.split(" ")[0];
  renderOverview();
  renderScripts();
  renderAppointments();
  renderProducts();
  renderProfile();
  showApp();
}

loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    clearOtherPortalTokens("patient");
    const res = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
    });
    if (!res.ok) throw new Error(res.error || "Login failed.");
    if (res.role !== "patient") throw new Error("Patient login only.");
    setToken(res.token);
    loginError.hidden = true;
    await refresh();
    setView("overview");
  } catch (err) {
    loginError.textContent = err.message;
    loginError.hidden = false;
  }
});

document.querySelector("[data-logout]")?.addEventListener("click", () => showLogin());
nav?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-view]");
  if (btn) setView(btn.dataset.view);
});
bottomNav?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-view]");
  if (btn) setView(btn.dataset.view);
});
document.querySelector("[data-menu-toggle]")?.addEventListener("click", () => {
  sidebar?.classList.toggle("is-open");
});

document.querySelector("[data-checkout-products]")?.addEventListener("click", async () => {
  if (!cart.length) return;
  const items = cart.map((c) => ({ id: c.id, name: c.name, price: c.price, qty: c.qty }));
  await api("/api/patient/orders", { method: "POST", body: JSON.stringify({ items }) });
  cart = [];
  renderCart();
  await refresh();
  alert("Order placed.");
  setView("overview");
});

if (getToken()) {
  api("/api/auth/me")
    .then(async (res) => {
      if (res.role !== "patient") throw new Error();
      await refresh();
      setView("overview");
    })
    .catch(() => showLogin(false));
} else {
  showLogin(false);
}