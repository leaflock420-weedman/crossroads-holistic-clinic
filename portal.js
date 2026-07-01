import { PRODUCTS } from "./js/data.js";
import { api, setToken, getToken, configureAuth, clearOtherPortalTokens, isReorderReady, daysUntilReorder } from "./js/api.js";
import { notifyClinicUpdate, onClinicUpdate, startPolling } from "./js/sync.js";
import { mountConnectionBanner } from "./js/connection.js";
import { getSites, siteHref, initSiteLinks } from "./js/sites.js";

configureAuth("patient");

let bookUrl = "/start.html";
getSites().then((sites) => {
  bookUrl = siteHref(sites, "book");
  initSiteLinks();
});

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
const medRequestDialog = document.querySelector("[data-med-request-dialog]");
const medRequestForm = document.querySelector("[data-med-request-form]");

const TITLES = {
  overview: "Overview",
  scripts: "My scripts",
  appointments: "Appointments",
  products: "Products",
  profile: "Profile",
};

let patientData = null;
let cart = [];
let stopPolling = null;
let unsubscribeClinic = null;

function visiblePrescriptions(list) {
  return (list || []).filter((r) => r.status === "active" || r.status === "reorder_requested");
}

function pendingChangeFor(rxId) {
  return (patientData?.changeRequests || []).find(
    (c) => c.prescriptionId === rxId && ["pending", "with_doctor"].includes(c.status)
  );
}

function showLogin(clear = true) {
  if (clear) setToken(null);
  loginView.hidden = false;
  appView.hidden = true;
}

function showApp() {
  loginView.hidden = true;
  appView.hidden = false;
  mountConnectionBanner(document.querySelector(".patient-main"));
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
  const pendingChanges = (patientData.changeRequests || []).filter((c) =>
    ["pending", "with_doctor"].includes(c.status)
  ).length;

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
    nextApt.innerHTML = `<p class="eyebrow">Next consult</p><h3>No booking yet</h3><p><a href="${bookUrl}">Book a consult</a></p>`;
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
        <div><dt>Supply</dt><dd>${rx.supplyDays || 30} days</dd></div>
        <div><dt>Interval</dt><dd>Every ${rx.intervalDays || 30} day${rx.intervalDays === 1 ? "" : "s"}</dd></div>
        <div><dt>Next reorder</dt><dd>${rx.nextReorderAt ? formatDate(rx.nextReorderAt) : "TBC"}</dd></div>
      </dl>
      ${rx.erxToken ? `<div class="erx-token-card"><p class="eyebrow">Your eScript (eRx)</p><p class="erx-token">${rx.erxToken}</p><p><a href="${rx.ausscriptsUrl || `https://ausscripts.erx.com.au/scripts/${rx.erxToken}`}" target="_blank" rel="noopener">Open AusScripts link</a> — present at any Australian pharmacy.</p></div>` : ""}
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
    notifyClinicUpdate();
    changeDialog.close();
    await refresh();
    setView("scripts");
    alert("Change request sent — admin will review and forward to your clinician.");
  } catch (err) {
    alert(err.message);
  }
});

document.querySelector("[data-change-cancel]")?.addEventListener("click", () => changeDialog?.close());

document.querySelector("[data-open-med-request]")?.addEventListener("click", () => medRequestDialog?.showModal());
document.querySelector("[data-med-request-cancel]")?.addEventListener("click", () => medRequestDialog?.close());

medRequestForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(medRequestForm);
  try {
    await api("/api/patient/medication-requests", {
      method: "POST",
      body: JSON.stringify({
        requestType: fd.get("requestType"),
        requestedProduct: fd.get("requestedProduct"),
        requestedForm: fd.get("requestedForm"),
        requestedStrength: fd.get("requestedStrength"),
        reason: fd.get("reason"),
        notes: fd.get("notes"),
      }),
    });
    notifyClinicUpdate();
    medRequestDialog.close();
    await refresh();
    setView("scripts");
    alert("Request submitted — admin will review and forward to your clinician.");
  } catch (err) {
    alert(err.message);
  }
});

function renderAppointments() {
  const list = document.querySelector("[data-appointment-list]");
  const { appointments } = patientData;

  if (!appointments.length) {
    list.innerHTML = `<p class="empty-state">No appointments yet. <a href="${bookUrl}">Book your consult</a></p>`;
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

function shippingFee(method) {
  if (method === "signature") return 25;
  if (method === "post") return 20;
  return 0;
}

function renderCart() {
  const panel = document.querySelector("[data-cart-panel]");
  const items = document.querySelector("[data-cart-items]");
  const total = document.querySelector("[data-cart-total]");
  const deliveryEl = document.querySelector("[data-delivery-method]");
  if (!cart.length) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  items.innerHTML = cart.map((c) => `<div class="cart-line"><span>${c.name} × ${c.qty}</span><strong>$${(c.price * c.qty).toFixed(2)}</strong></div>`).join("");
  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const ship = shippingFee(deliveryEl?.value || "pickup");
  total.innerHTML = `
    <div class="cart-line"><span>Subtotal</span><strong>$${subtotal.toFixed(2)}</strong></div>
    ${ship ? `<div class="cart-line"><span>Delivery</span><strong>$${ship.toFixed(2)}</strong></div>` : ""}
    <div class="cart-line cart-line--total"><span>Total</span><strong>$${(subtotal + ship).toFixed(2)} AUD</strong></div>`;
}

document.querySelector("[data-delivery-method]")?.addEventListener("change", renderCart);

function renderProfile() {
  const list = document.querySelector("[data-profile-list]");
  const form = document.querySelector("[data-address-form]");
  const { patient } = patientData;
  if (form) {
    form.addressLine1.value = patient.addressLine1 || "";
    form.addressLine2.value = patient.addressLine2 || "";
    form.suburb.value = patient.suburb || "";
    form.postcode.value = patient.postcode || "";
    form.phone.value = patient.phone || "";
  }
  const addr = [patient.addressLine1, patient.suburb, patient.postcode].filter(Boolean).join(", ");
  list.innerHTML = `
    <div><dt>Name</dt><dd>${patient.name}</dd></div>
    <div><dt>Email</dt><dd>${patient.email}</dd></div>
    <div><dt>Phone</dt><dd>${patient.phone || "—"}</dd></div>
    <div><dt>Delivery</dt><dd>${addr || "Add address above"}</dd></div>
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
  const followupDate = document.querySelector("[data-followup-date]");
  if (followupDate && !followupDate.value) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    followupDate.value = d.toISOString().slice(0, 10);
  }
  loadFollowupSlots();
  showApp();
  stopPolling?.();
  unsubscribeClinic?.();
  stopPolling = startPolling(() => refresh(), 4000);
  unsubscribeClinic = onClinicUpdate(() => refresh());
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

document.querySelector("[data-address-form]")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await api("/api/patient/profile", {
    method: "PUT",
    body: JSON.stringify({
      addressLine1: fd.get("addressLine1"),
      addressLine2: fd.get("addressLine2"),
      suburb: fd.get("suburb"),
      postcode: fd.get("postcode"),
      phone: fd.get("phone"),
    }),
  });
  await refresh();
  alert("Address saved.");
});

async function loadFollowupSlots() {
  const grid = document.querySelector("[data-followup-slots]");
  const dateInput = document.querySelector("[data-followup-date]");
  const timeInput = document.querySelector("[data-followup-time]");
  if (!grid || !dateInput) return;
  const doctorId = patientData?.patient?.assignedDoctorId;
  const date = dateInput.value;
  timeInput.value = "";
  if (!doctorId) {
    grid.innerHTML = `<p class="empty-state">No clinician assigned yet — contact the clinic.</p>`;
    return;
  }
  if (!date) {
    grid.innerHTML = `<p class="empty-state">Select a date to see open 15-minute slots.</p>`;
    return;
  }
  grid.innerHTML = `<p class="empty-state">Loading open slots…</p>`;
  try {
    const data = await api(`/api/booking/slots?doctorId=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(date)}`);
    const times = data.available || [];
    if (!times.length) {
      grid.innerHTML = `<p class="empty-state">No open slots this day. Try another date.</p>`;
      return;
    }
    grid.innerHTML = times
      .map(
        (time) => `
      <label class="slot">
        <input type="radio" name="followupSlot" value="${time}" required data-followup-slot />
        <span>${time}</span>
      </label>`
      )
      .join("");
    grid.querySelectorAll("[data-followup-slot]").forEach((input) => {
      input.addEventListener("change", () => {
        timeInput.value = input.value;
      });
    });
  } catch (err) {
    grid.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

document.querySelector("[data-followup-date]")?.addEventListener("change", loadFollowupSlots);

document.querySelector("[data-followup-form]")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const resultEl = document.querySelector("[data-followup-result]");
  const time = document.querySelector("[data-followup-time]")?.value || fd.get("time");
  if (!time) {
    resultEl.textContent = "Please select an open 15-minute time slot.";
    resultEl.hidden = false;
    return;
  }
  try {
    const hasActive = (patientData?.prescriptions || []).some((r) => r.status === "active");
    await api("/api/patient/appointments", {
      method: "POST",
      body: JSON.stringify({
        date: fd.get("date"),
        time,
        patientType: hasActive ? "existing" : "new",
        type: hasActive ? "60-day review" : "30-day review",
      }),
    });
    notifyClinicUpdate();
    resultEl.textContent = "Follow-up booked — you'll see it in your appointments list.";
    resultEl.hidden = false;
    await refresh();
  } catch (err) {
    resultEl.textContent = err.message;
    resultEl.hidden = false;
  }
});

document.querySelector("[data-checkout-products]")?.addEventListener("click", async () => {
  if (!cart.length) return;
  const items = cart.map((c) => ({ id: c.id, name: c.name, price: c.price, qty: c.qty }));
  const delivery = document.querySelector("[data-delivery-method]")?.value || "pickup";
  await api("/api/patient/orders", { method: "POST", body: JSON.stringify({ items, delivery }) });
  notifyClinicUpdate();
  cart = [];
  renderCart();
  await refresh();
  alert("Order placed — admin will fulfil via your chosen delivery method.");
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