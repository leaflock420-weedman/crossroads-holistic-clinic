import { PRODUCTS } from "./js/data.js";
import { api, setToken, getToken, configureAuth, clearOtherPortalTokens, isReorderReady, daysUntilReorder, isDemoMode } from "./js/api.js";

configureAuth("patient");

const loginView = document.querySelector("[data-login-view]");
const appView = document.querySelector("[data-app-view]");
const loginForm = document.querySelector("[data-login-form]");
const loginError = document.querySelector("[data-login-error]");
const nav = document.querySelector("[data-portal-nav]");
const views = Array.from(document.querySelectorAll("[data-portal-view]"));
const pageTitle = document.querySelector("[data-page-title]");
const pageEyebrow = document.querySelector("[data-page-eyebrow]");

const TITLES = {
  overview: "Overview",
  scripts: "My scripts",
  appointments: "Appointments",
  products: "Products",
  profile: "Profile",
};

let patientData = null;

function visiblePrescriptions(list) {
  return (list || []).filter((r) => r.status === "active" || r.status === "reorder_requested");
}
let cart = [];

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
      banner.textContent = "Demo mode — data is simulated locally until the server API is live.";
      appView.prepend(banner);
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
  nav?.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === name);
  });
  if (pageTitle) pageTitle.textContent = TITLES[name] || "Portal";
  if (pageEyebrow) pageEyebrow.textContent = patientData?.patient?.name || "Patient portal";
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function renderOverview() {
  const stats = document.querySelector("[data-overview-stats]");
  const nextApt = document.querySelector("[data-next-appointment]");
  const scriptSum = document.querySelector("[data-script-summary]");
  const { patient, appointments, prescriptions, orders } = patientData;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = appointments.find((a) => a.date >= today && a.status !== "completed");
  const visible = visiblePrescriptions(prescriptions);
  const activeRx = visible.filter((r) => r.status === "active");
  const readyRx = activeRx.filter(isReorderReady);

  stats.innerHTML = `
    <article class="stat"><strong>${appointments.length}</strong><span>Appointments</span></article>
    <article class="stat"><strong>${activeRx.length}</strong><span>Scripts on file</span></article>
    <article class="stat"><strong>${readyRx.length}</strong><span>Ready to reorder</span></article>
    <article class="stat"><strong>${orders.length}</strong><span>Product orders</span></article>
  `;

  if (upcoming) {
    nextApt.innerHTML = `
      <p class="eyebrow">Next consult</p>
      <h3>${formatDate(upcoming.date)} at ${upcoming.time}</h3>
      <p>${upcoming.clinician} · ${upcoming.format}</p>
      <span class="status-pill confirmed">${upcoming.status}</span>
    `;
  } else {
    nextApt.innerHTML = `<p class="eyebrow">Next consult</p><h3>No upcoming booking</h3><p><a href="/start.html">Book a consult</a></p>`;
  }

  const rx = visiblePrescriptions(prescriptions)[0];
  if (!rx) {
    scriptSum.innerHTML = `<p class="eyebrow">Scripts</p><h3>None yet</h3><p>Updated after your clinician review.</p>`;
    return;
  }

  if (rx.status === "pending_review") {
    scriptSum.innerHTML = `
      <p class="eyebrow">Scripts</p>
      <h3>Awaiting clinician review</h3>
      <p>Your treatment plan will appear here after your consult.</p>
      <span class="status-pill pending">Pending review</span>
    `;
    return;
  }

  const ready = isReorderReady(rx);
  scriptSum.innerHTML = `
    <p class="eyebrow">Active script</p>
    <h3>${rx.name}</h3>
    <p>${rx.form} · ${rx.repeats} of ${rx.repeatsTotal} repeats left</p>
    <span class="status-pill ${ready ? "ready" : "waiting"}">${ready ? "Ready to reorder" : `Reorder in ${daysUntilReorder(rx)} days`}</span>
  `;
}

function renderScripts() {
  const list = document.querySelector("[data-script-list]");
  const prescriptions = visiblePrescriptions(patientData.prescriptions);

  if (!prescriptions.length) {
    list.innerHTML = `<p class="empty-state">No released scripts yet. Your clinician and admin team will publish them here after review.</p>`;
    return;
  }

  list.innerHTML = prescriptions.map((rx) => {
    const ready = isReorderReady(rx);
    const days = daysUntilReorder(rx);
    const statusClass = rx.status === "pending_review" ? "pending" : ready ? "ready" : "waiting";
    const statusText = rx.status === "pending_review"
      ? "Awaiting clinician review"
      : ready ? "Ready to reorder" : `Reorder available in ${days} day${days === 1 ? "" : "s"}`;

    return `<article class="script-card">
      <header>
        <div><h3>${rx.name}</h3><p>${rx.form}</p></div>
        <span class="status-pill ${statusClass}">${statusText}</span>
      </header>
      <dl class="script-meta">
        <div><dt>Prescribed</dt><dd>${rx.prescribedAt ? formatDate(rx.prescribedAt) : "After consult"}</dd></div>
        <div><dt>Repeats</dt><dd>${rx.repeats} / ${rx.repeatsTotal}</dd></div>
        <div><dt>Interval</dt><dd>Every ${rx.intervalDays} days</dd></div>
        <div><dt>Next reorder</dt><dd>${rx.nextReorderAt ? formatDate(rx.nextReorderAt) : "TBC"}</dd></div>
      </dl>
      <p class="script-note">${rx.notes || ""}</p>
      ${
        rx.erxToken
          ? `<div class="erx-token-card">
              <p class="eyebrow">Electronic prescription (eRx)</p>
              <p class="erx-token">${rx.erxToken}</p>
              <p>Present this token at any pharmacy, or <a href="${rx.ausscriptsUrl || "https://ausscripts.erx.com.au/"}" target="_blank" rel="noopener">order via AusScripts</a>.</p>
            </div>`
          : ""
      }
      ${ready ? `<button type="button" class="button primary" data-reorder="${rx.id}">Request reorder</button>` : ""}
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
}

function renderAppointments() {
  const list = document.querySelector("[data-appointment-list]");
  const { appointments } = patientData;

  if (!appointments.length) {
    list.innerHTML = `<p class="empty-state">No appointments yet. <a href="/start.html">Book your initial consult</a></p>`;
    return;
  }

  list.innerHTML = appointments.map((a) => `
    <article class="apt-card">
      <div>
        <p class="eyebrow">${a.type}</p>
        <h3>${formatDate(a.date)} at ${a.time}</h3>
        <p>${a.clinician} · ${a.format}</p>
      </div>
      <div class="apt-card__side">
        <span class="status-pill confirmed">${a.telehealthStatus || a.status}</span>
        <strong>$${a.fee}.00 paid</strong>
      </div>
    </article>
  `).join("");
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
        <button type="button" class="button ghost" data-add-product="${p.id}">Add to cart</button>
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
  if (!cart.length) { panel.hidden = true; return; }
  panel.hidden = false;
  items.innerHTML = cart.map((c) => `
    <div class="cart-line"><span>${c.name} × ${c.qty}</span><strong>$${(c.price * c.qty).toFixed(2)}</strong></div>
  `).join("");
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
    <div><dt>Support area</dt><dd>${patient.support || "—"}</dd></div>
    <div><dt>Portal status</dt><dd>${patient.stage}</dd></div>
  `;
}

async function refresh() {
  patientData = await api("/api/patient/dashboard");
  document.querySelector("[data-sidebar-name]")?.replaceChildren(document.createTextNode(patientData.patient.name));
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
    if (res.role !== "patient") throw new Error("Patient login only — use doctor or admin portals.");
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

document.querySelector("[data-checkout-products]")?.addEventListener("click", async () => {
  if (!cart.length) return;
  const items = cart.map((c) => ({ id: c.id, name: c.name, price: c.price, qty: c.qty }));
  await api("/api/patient/orders", { method: "POST", body: JSON.stringify({ items }) });
  cart = [];
  renderCart();
  await refresh();
  alert("Order placed — dispatch confirmation coming by email.");
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