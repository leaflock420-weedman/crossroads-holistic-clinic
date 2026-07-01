const STORAGE_KEY = "crossroads-portal-v1";
const SESSION_KEY = "crossroads-session";
const CONSULT_FEE = 49;

const DEFAULT_STATE = {
  patients: [],
  prescriptions: [],
  appointments: [],
  orders: [],
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid(prefix = "CR") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function hashPassword(password) {
  let h = 0;
  for (let i = 0; i < password.length; i++) h = (Math.imul(31, h) + password.charCodeAt(i)) | 0;
  return `x${Math.abs(h)}`;
}

export function getConsultFee() {
  return CONSULT_FEE;
}

export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(patientId) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ patientId, at: Date.now() }));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function login(email, password) {
  const state = loadState();
  const patient = state.patients.find(
    (p) => p.email.toLowerCase() === email.toLowerCase() && p.passwordHash === hashPassword(password)
  );
  if (!patient) return { ok: false, error: "Email or password not recognised." };
  setSession(patient.id);
  return { ok: true, patient };
}

export function getCurrentPatient() {
  const session = getSession();
  if (!session) return null;
  const state = loadState();
  return state.patients.find((p) => p.id === session.patientId) || null;
}

export function registerPatient(payload) {
  const state = loadState();
  const exists = state.patients.some((p) => p.email.toLowerCase() === payload.email.toLowerCase());
  if (exists) return { ok: false, error: "An account with this email already exists. Try logging in." };

  const password = payload.password || generateTempPassword();
  const patient = {
    id: uid("PT"),
    createdAt: new Date().toISOString(),
    name: payload.name,
    email: payload.email,
    phone: payload.phone || "",
    state: payload.state,
    support: payload.support || "",
    history: payload.history || "",
    passwordHash: hashPassword(password),
    paid: Boolean(payload.paid),
    paidAt: payload.paid ? new Date().toISOString() : null,
    stage: payload.paid ? "Portal active" : "Awaiting payment",
  };

  state.patients.push(patient);

  if (payload.appointment) {
    state.appointments.push({
      id: uid("APT"),
      patientId: patient.id,
      ...payload.appointment,
      status: "confirmed",
      type: "Initial consult",
      fee: CONSULT_FEE,
    });
  }

  if (payload.paid) {
    state.prescriptions.push({
      id: uid("RX"),
      patientId: patient.id,
      name: "Treatment plan pending review",
      form: "As prescribed after consult",
      repeats: 0,
      repeatsTotal: 5,
      status: "pending_review",
      intervalDays: 28,
      nextReorderAt: null,
      prescribedAt: null,
      notes: "Your clinician will update this after your initial consult.",
    });
  }

  saveState(state);
  setSession(patient.id);
  return { ok: true, patient, password };
}

export function getPatientData(patientId) {
  const state = loadState();
  const patient = state.patients.find((p) => p.id === patientId);
  if (!patient) return null;
  return {
    patient,
    appointments: state.appointments.filter((a) => a.patientId === patientId),
    prescriptions: state.prescriptions.filter((r) => r.patientId === patientId),
    orders: state.orders.filter((o) => o.patientId === patientId),
  };
}

export function requestReorder(prescriptionId) {
  const state = loadState();
  const rx = state.prescriptions.find((r) => r.id === prescriptionId);
  if (!rx) return { ok: false, error: "Prescription not found." };
  if (!isReorderReady(rx)) return { ok: false, error: "Reorder is not available yet." };
  rx.status = "reorder_requested";
  rx.repeats = Math.max(0, (rx.repeats || 0) - 1);
  const base = rx.nextReorderAt ? new Date(rx.nextReorderAt) : new Date();
  rx.nextReorderAt = new Date(base.getTime() + rx.intervalDays * 86400000).toISOString();
  saveState(state);
  return { ok: true, prescription: rx };
}

export function placeProductOrder(patientId, items) {
  const state = loadState();
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const order = {
    id: uid("ORD"),
    patientId,
    items,
    total,
    status: "processing",
    createdAt: new Date().toISOString(),
  };
  state.orders.push(order);
  saveState(state);
  return { ok: true, order };
}

export function isReorderReady(rx) {
  if (!rx || rx.status === "pending_review") return false;
  if (rx.repeats <= 0) return false;
  if (!rx.nextReorderAt) return rx.status === "active";
  return Date.now() >= new Date(rx.nextReorderAt).getTime();
}

export function daysUntilReorder(rx) {
  if (!rx?.nextReorderAt) return 0;
  const diff = new Date(rx.nextReorderAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function generateTempPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function seedDemoPatient() {
  const state = loadState();
  if (state.patients.some((p) => p.email === "demo@crossroads.clinic")) return;

  const demo = registerPatient({
    name: "Jordan Mitchell",
    email: "demo@crossroads.clinic",
    phone: "0412 345 678",
    state: "NSW",
    support: "Sleep or routine support",
    history: "New patient",
    password: "demo1234",
    paid: true,
    appointment: {
      date: nextWeekday(3),
      time: "10:30",
      clinician: "Dr Patel",
      format: "Video consult",
    },
  });

  if (demo.ok) {
    const s = loadState();
    const rx = s.prescriptions.find((r) => r.patientId === demo.patient.id);
    if (rx) {
      rx.name = "Holistic sleep support — Flower";
      rx.form = "Dried herb · 10g";
      rx.repeats = 3;
      rx.repeatsTotal = 5;
      rx.status = "active";
      rx.prescribedAt = new Date(Date.now() - 20 * 86400000).toISOString();
      rx.nextReorderAt = new Date(Date.now() + 8 * 86400000).toISOString();
      rx.intervalDays = 28;
      rx.notes = "Take as directed. Reorder opens when your interval is ready.";
      saveState(s);
    }
  }
}

function nextWeekday(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}