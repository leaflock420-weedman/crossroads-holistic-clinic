const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "clinic-live.json");
const CONSULT_FEE = 49;

function uid(prefix = "CR") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function defaultState() {
  return {
    users: [],
    patients: [],
    prescriptions: [],
    appointments: [],
    orders: [],
    telehealthLogs: [],
    sessions: {},
  };
}

function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) return defaultState();
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return { ...defaultState(), ...raw };
  } catch {
    return defaultState();
  }
}

function save(state) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

let state = load();

function persist() {
  save(state);
}

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

function sanitizePatient(patient) {
  if (!patient) return null;
  const { passwordHash, ...safe } = patient;
  return safe;
}

function findUserByEmail(email) {
  const lower = String(email || "").toLowerCase();
  return (
    state.users.find((u) => u.email.toLowerCase() === lower) ||
    state.patients.find((p) => p.email.toLowerCase() === lower)
  );
}

function createToken(user) {
  const token = crypto.randomBytes(24).toString("hex");
  state.sessions[token] = {
    userId: user.id,
    role: user.role,
    at: Date.now(),
  };
  persist();
  return token;
}

function getSession(token) {
  if (!token) return null;
  const session = state.sessions[token];
  if (!session) return null;
  if (Date.now() - session.at > 7 * 86400000) {
    delete state.sessions[token];
    persist();
    return null;
  }
  const user =
    state.users.find((u) => u.id === session.userId) ||
    state.patients.find((p) => p.id === session.userId);
  if (!user) return null;
  return { token, user: sanitizeUser(user) || sanitizePatient(user), role: session.role };
}

function clearToken(token) {
  delete state.sessions[token];
  persist();
}

function login(email, password) {
  const user = findUserByEmail(email);
  if (!user || user.passwordHash !== hashPassword(password)) {
    return { ok: false, error: "Email or password not recognised." };
  }
  const token = createToken(user);
  const safe = user.role === "patient" ? sanitizePatient(user) : sanitizeUser(user);
  return { ok: true, token, user: safe, role: user.role };
}

function registerPatient(payload) {
  const exists = state.patients.some((p) => p.email.toLowerCase() === payload.email.toLowerCase());
  if (exists) return { ok: false, error: "An account with this email already exists." };

  const password = payload.password || generateTempPassword();
  const patient = {
    id: uid("PT"),
    role: "patient",
    createdAt: new Date().toISOString(),
    name: payload.name,
    email: payload.email.toLowerCase(),
    phone: payload.phone || "",
    state: payload.state,
    support: payload.support || "",
    passwordHash: hashPassword(password),
    paid: Boolean(payload.paid),
    paidAt: payload.paid ? new Date().toISOString() : null,
    stage: payload.paid ? "Portal active" : "Awaiting payment",
    assignedDoctorId: payload.assignedDoctorId || null,
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
      format: payload.appointment.format || "Phone consult",
      telehealthStatus: "scheduled",
    });
  }

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
    prescribedBy: null,
    notes: "Updated by clinician after consult.",
  });

  persist();
  const token = createToken(patient);
  return { ok: true, token, patient: sanitizePatient(patient), password };
}

function getPatientBundle(patientId) {
  const patient = state.patients.find((p) => p.id === patientId);
  if (!patient) return null;
  return {
    patient: sanitizePatient(patient),
    appointments: state.appointments.filter((a) => a.patientId === patientId),
    prescriptions: state.prescriptions.filter((r) => r.patientId === patientId),
    orders: state.orders.filter((o) => o.patientId === patientId),
  };
}

function listPatients() {
  return state.patients.map(sanitizePatient);
}

function updatePrescription(id, patch, actorId) {
  const rx = state.prescriptions.find((r) => r.id === id);
  if (!rx) return { ok: false, error: "Prescription not found." };
  Object.assign(rx, patch, { updatedAt: new Date().toISOString(), prescribedBy: actorId });
  if (patch.status === "active" && !rx.prescribedAt) {
    rx.prescribedAt = new Date().toISOString();
    if (!rx.nextReorderAt) {
      rx.nextReorderAt = new Date(Date.now() + (rx.intervalDays || 28) * 86400000).toISOString();
    }
  }
  persist();
  return { ok: true, prescription: rx };
}

function createPrescription(patientId, data, actorId) {
  const rx = {
    id: uid("RX"),
    patientId,
    name: data.name,
    form: data.form || "",
    repeats: Number(data.repeats ?? 5),
    repeatsTotal: Number(data.repeatsTotal ?? 5),
    status: data.status || "active",
    intervalDays: Number(data.intervalDays ?? 28),
    nextReorderAt: data.nextReorderAt || new Date(Date.now() + Number(data.intervalDays ?? 28) * 86400000).toISOString(),
    prescribedAt: new Date().toISOString(),
    prescribedBy: actorId,
    notes: data.notes || "",
  };
  state.prescriptions.push(rx);
  persist();
  return { ok: true, prescription: rx };
}

function startTelehealth(appointmentId, actorId) {
  const apt = state.appointments.find((a) => a.id === appointmentId);
  if (!apt) return { ok: false, error: "Appointment not found." };
  const patient = state.patients.find((p) => p.id === apt.patientId);
  const doctor = state.users.find((u) => u.id === actorId && u.role === "doctor");
  if (!patient?.phone) return { ok: false, error: "Patient has no phone number on file." };

  apt.telehealthStatus = "in_progress";
  apt.callStartedAt = new Date().toISOString();
  const log = {
    id: uid("CALL"),
    appointmentId,
    patientId: patient.id,
    startedBy: actorId,
    startedAt: apt.callStartedAt,
    patientPhone: patient.phone,
    doctorPhone: doctor?.phone || null,
  };
  state.telehealthLogs.push(log);
  persist();

  const phoneDigits = patient.phone.replace(/\D/g, "");
  return {
    ok: true,
    log,
    patientName: patient.name,
    patientPhone: patient.phone,
    telLink: phoneDigits ? `tel:${phoneDigits}` : null,
    message: `Connecting phone consult with ${patient.name}. Your device will dial ${patient.phone}.`,
  };
}

function completeTelehealth(appointmentId) {
  const apt = state.appointments.find((a) => a.id === appointmentId);
  if (!apt) return { ok: false, error: "Appointment not found." };
  apt.telehealthStatus = "completed";
  apt.status = "completed";
  apt.callEndedAt = new Date().toISOString();
  persist();
  return { ok: true, appointment: apt };
}

function requestReorder(prescriptionId) {
  const rx = state.prescriptions.find((r) => r.id === prescriptionId);
  if (!rx) return { ok: false, error: "Prescription not found." };
  if (rx.status === "pending_review") return { ok: false, error: "Script not active yet." };
  if (rx.repeats <= 0) return { ok: false, error: "No repeats remaining." };
  if (rx.nextReorderAt && Date.now() < new Date(rx.nextReorderAt).getTime()) {
    return { ok: false, error: "Reorder interval not reached yet." };
  }
  rx.status = "reorder_requested";
  rx.repeats = Math.max(0, rx.repeats - 1);
  rx.nextReorderAt = new Date(Date.now() + (rx.intervalDays || 28) * 86400000).toISOString();
  persist();
  return { ok: true, prescription: rx };
}

function placeOrder(patientId, items) {
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
  persist();
  return { ok: true, order };
}

function adminOverview() {
  return {
    stats: {
      patients: state.patients.length,
      appointments: state.appointments.length,
      prescriptions: state.prescriptions.length,
      reorderRequests: state.prescriptions.filter((r) => r.status === "reorder_requested").length,
      orders: state.orders.length,
    },
    patients: listPatients(),
    appointments: state.appointments,
    prescriptions: state.prescriptions,
    orders: state.orders,
    doctors: state.users.filter((u) => u.role === "doctor").map(sanitizeUser),
    telehealthLogs: state.telehealthLogs.slice(-20),
  };
}

function updatePatient(id, patch) {
  const patient = state.patients.find((p) => p.id === id);
  if (!patient) return { ok: false, error: "Patient not found." };
  Object.assign(patient, patch);
  persist();
  return { ok: true, patient: sanitizePatient(patient) };
}

function updateAppointment(id, patch) {
  const apt = state.appointments.find((a) => a.id === id);
  if (!apt) return { ok: false, error: "Appointment not found." };
  Object.assign(apt, patch);
  persist();
  return { ok: true, appointment: apt };
}

function doctorQueue(doctorId) {
  const doctor = state.users.find((u) => u.id === doctorId);
  const today = new Date().toISOString().slice(0, 10);
  const appointments = state.appointments
    .filter((a) => {
      if (a.telehealthStatus === "in_progress") return true;
      if (a.status === "confirmed" && a.telehealthStatus !== "completed") return true;
      if (a.telehealthStatus === "completed" && a.date === today) return true;
      const pendingRx = state.prescriptions.some(
        (r) => r.patientId === a.patientId && (r.status === "pending_review" || r.status === "reorder_requested")
      );
      return pendingRx && a.date >= today;
    })
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  return appointments.map((apt) => {
    const patient = state.patients.find((p) => p.id === apt.patientId);
    const prescriptions = state.prescriptions.filter((r) => r.patientId === apt.patientId);
    return {
      appointment: apt,
      patient: sanitizePatient(patient),
      prescriptions,
    };
  });
}

function generateTempPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function seedIfEmpty() {
  if (state.patients.length || state.users.length) return;

  const admin = {
    id: uid("ADM"),
    role: "admin",
    name: "Crossroads Admin",
    email: "admin@crossroads.clinic",
    phone: "1800 000 000",
    passwordHash: hashPassword(process.env.ADMIN_PASSWORD || "CrossroadsAdmin2026"),
  };

  const doctor = {
    id: uid("DOC"),
    role: "doctor",
    name: "Dr Patel",
    email: "dr.patel@crossroads.clinic",
    phone: "0411 222 333",
    passwordHash: hashPassword(process.env.DOCTOR_PASSWORD || "Doctor2026"),
  };

  state.users.push(admin, doctor);

  const d = new Date();
  d.setDate(d.getDate() + 2);
  const demoDate = d.toISOString().slice(0, 10);

  registerPatient({
    name: "Jordan Mitchell",
    email: "demo@crossroads.clinic",
    phone: "0412 345 678",
    state: "NSW",
    support: "Sleep or routine support",
    password: "demo1234",
    paid: true,
    assignedDoctorId: doctor.id,
    appointment: {
      date: demoDate,
      time: "10:30",
      clinician: doctor.name,
      format: "Phone consult",
    },
  });

  const demo = state.patients.find((p) => p.email === "demo@crossroads.clinic");
  const rx = state.prescriptions.find((r) => r.patientId === demo?.id);
  if (rx) {
    Object.assign(rx, {
      name: "Holistic sleep support — Flower",
      form: "Dried herb · 10g",
      repeats: 3,
      repeatsTotal: 5,
      status: "active",
      prescribedAt: new Date(Date.now() - 20 * 86400000).toISOString(),
      nextReorderAt: new Date(Date.now() + 8 * 86400000).toISOString(),
      intervalDays: 28,
      prescribedBy: doctor.id,
      notes: "Take as directed. Reorder opens when interval is ready.",
    });
  }

  persist();
  console.log("Seeded demo accounts:");
  console.log("  Admin:  admin@crossroads.clinic");
  console.log("  Doctor: dr.patel@crossroads.clinic");
  console.log("  Patient: demo@crossroads.clinic / demo1234");
}

seedIfEmpty();

module.exports = {
  CONSULT_FEE,
  login,
  clearToken,
  getSession,
  registerPatient,
  getPatientBundle,
  listPatients,
  updatePrescription,
  createPrescription,
  startTelehealth,
  completeTelehealth,
  requestReorder,
  placeOrder,
  adminOverview,
  updatePatient,
  updateAppointment,
  doctorQueue,
  sanitizePatient,
};