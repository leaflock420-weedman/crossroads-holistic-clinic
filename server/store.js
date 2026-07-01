const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "clinic-live.json");
const CONSULT_FEE = 49;
const APPOINTMENT_MINUTES = 15;

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
    availability: [],
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
    const doctor = resolveDoctor(payload.appointment.doctorId || payload.assignedDoctorId, payload.appointment.clinician);
    state.appointments.push({
      id: uid("APT"),
      patientId: patient.id,
      ...payload.appointment,
      doctorId: doctor?.id || payload.appointment.doctorId || null,
      clinician: doctor?.name || payload.appointment.clinician || "First available",
      durationMinutes: APPOINTMENT_MINUTES,
      status: "confirmed",
      type: "Initial consult",
      fee: CONSULT_FEE,
      format: payload.appointment.format || "Phone consult",
      telehealthStatus: "scheduled",
    });
    if (doctor) patient.assignedDoctorId = doctor.id;
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

function resolveDoctor(doctorId, clinicianName) {
  if (doctorId) return state.users.find((u) => u.id === doctorId && u.role === "doctor") || null;
  if (!clinicianName) return null;
  return state.users.find((u) => u.role === "doctor" && u.name === clinicianName) || null;
}

function updatePrescription(id, patch, actorId) {
  const rx = state.prescriptions.find((r) => r.id === id);
  if (!rx) return { ok: false, error: "Prescription not found." };
  const actor = state.users.find((u) => u.id === actorId);
  const nextPatch = { ...patch };
  if (actor?.role === "doctor" && nextPatch.status === "active") {
    nextPatch.status = "pending_dispense";
  }
  Object.assign(rx, nextPatch, { updatedAt: new Date().toISOString(), prescribedBy: actorId });
  if (nextPatch.status === "pending_dispense") {
    rx.submittedAt = new Date().toISOString();
  }
  persist();
  return { ok: true, prescription: rx };
}

function dispensePrescription(id, actorId) {
  const rx = state.prescriptions.find((r) => r.id === id);
  if (!rx) return { ok: false, error: "Prescription not found." };
  if (!["pending_dispense", "pending_review", "reorder_requested"].includes(rx.status)) {
    return { ok: false, error: "Script is not awaiting dispense." };
  }
  rx.status = "active";
  rx.dispensedAt = new Date().toISOString();
  rx.dispensedBy = actorId;
  if (!rx.prescribedAt) rx.prescribedAt = rx.dispensedAt;
  if (!rx.nextReorderAt) {
    rx.nextReorderAt = new Date(Date.now() + (rx.intervalDays || 28) * 86400000).toISOString();
  }
  persist();
  return { ok: true, prescription: rx };
}

function createPrescription(patientId, data, actorId) {
  const actor = state.users.find((u) => u.id === actorId);
  let status = data.status || "pending_dispense";
  if (actor?.role === "doctor" && status === "active") status = "pending_dispense";
  if (actor?.role === "admin" && data.releaseNow) status = "active";

  const rx = {
    id: uid("RX"),
    patientId,
    name: data.name,
    form: data.form || "",
    repeats: Number(data.repeats ?? 5),
    repeatsTotal: Number(data.repeatsTotal ?? 5),
    status,
    intervalDays: Number(data.intervalDays ?? 28),
    nextReorderAt: status === "active"
      ? data.nextReorderAt || new Date(Date.now() + Number(data.intervalDays ?? 28) * 86400000).toISOString()
      : null,
    prescribedAt: status === "active" ? new Date().toISOString() : null,
    prescribedBy: actorId,
    submittedAt: new Date().toISOString(),
    notes: data.notes || "",
  };
  if (status === "active") {
    rx.dispensedAt = new Date().toISOString();
    rx.dispensedBy = actorId;
  }
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

function listDoctors() {
  return state.users.filter((u) => u.role === "doctor").map(sanitizeUser);
}

function getDoctorAvailability(doctorId, date) {
  return state.availability.filter((s) => s.doctorId === doctorId && s.date === date);
}

function setDoctorAvailability(doctorId, date, times) {
  state.availability = state.availability.filter((s) => !(s.doctorId === doctorId && s.date === date));
  const unique = [...new Set(times || [])];
  unique.forEach((time) => {
    state.availability.push({ id: uid("AVL"), doctorId, date, time, durationMinutes: APPOINTMENT_MINUTES });
  });
  persist();
  return { ok: true, slots: getDoctorAvailability(doctorId, date) };
}

function getBookedTimes(doctorId, date) {
  return state.appointments
    .filter((a) => a.date === date && a.status !== "cancelled" && (a.doctorId === doctorId || resolveDoctor(a.doctorId, a.clinician)?.id === doctorId))
    .map((a) => a.time);
}

function getBookingSlots(doctorId, date) {
  const doctor = state.users.find((u) => u.id === doctorId && u.role === "doctor");
  if (!doctor) return { ok: false, error: "Doctor not found." };
  const open = getDoctorAvailability(doctorId, date).map((s) => s.time);
  const booked = getBookedTimes(doctorId, date);
  const available = open.filter((t) => !booked.includes(t)).sort();
  return { ok: true, doctor: sanitizeUser(doctor), date, available, booked };
}

function adminCreatePatient(payload) {
  const exists = state.patients.some((p) => p.email.toLowerCase() === String(payload.email || "").toLowerCase());
  if (exists) return { ok: false, error: "An account with this email already exists." };

  const password = payload.password || generateTempPassword();
  const doctor = payload.assignedDoctorId ? resolveDoctor(payload.assignedDoctorId) : null;
  const patient = {
    id: uid("PT"),
    role: "patient",
    createdAt: new Date().toISOString(),
    name: payload.name,
    email: String(payload.email).toLowerCase(),
    phone: payload.phone || "",
    state: payload.state || "",
    support: payload.support || "",
    passwordHash: hashPassword(password),
    paid: Boolean(payload.paid ?? true),
    paidAt: payload.paid !== false ? new Date().toISOString() : null,
    stage: payload.paid === false ? "Awaiting payment" : "Portal active",
    assignedDoctorId: doctor?.id || payload.assignedDoctorId || null,
  };
  state.patients.push(patient);

  if (payload.createPendingScript !== false) {
    state.prescriptions.push({
      id: uid("RX"),
      patientId: patient.id,
      name: payload.scriptName || "Treatment plan pending review",
      form: payload.scriptForm || "As prescribed after consult",
      repeats: 0,
      repeatsTotal: 5,
      status: "pending_review",
      intervalDays: 28,
      nextReorderAt: null,
      prescribedAt: null,
      prescribedBy: doctor?.id || null,
      notes: "Awaiting clinician consult.",
    });
  }

  persist();
  return { ok: true, patient: sanitizePatient(patient), password };
}

function adminOverview() {
  return {
    stats: {
      patients: state.patients.length,
      appointments: state.appointments.length,
      prescriptions: state.prescriptions.length,
      reorderRequests: state.prescriptions.filter((r) => r.status === "reorder_requested").length,
      pendingDispense: state.prescriptions.filter((r) => r.status === "pending_dispense").length,
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
      const patient = state.patients.find((p) => p.id === a.patientId);
      const assigned = patient?.assignedDoctorId === doctorId || a.doctorId === doctorId || a.clinician === doctor?.name;
      if (!assigned && doctor?.role === "doctor") return false;
      if (a.telehealthStatus === "in_progress") return true;
      if (a.status === "confirmed" && a.telehealthStatus !== "completed") return true;
      if (a.telehealthStatus === "completed" && a.date === today) return true;
      const pendingRx = state.prescriptions.some(
        (r) => r.patientId === a.patientId && (r.status === "pending_review" || r.status === "pending_dispense" || r.status === "reorder_requested")
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

function upsertStaffUser({ role, name, email, phone, password }) {
  const lower = email.toLowerCase();
  let user = state.users.find((u) => u.email.toLowerCase() === lower);
  const passwordHash = hashPassword(password);
  if (!user) {
    user = {
      id: uid(role === "admin" ? "ADM" : "DOC"),
      role,
      name,
      email: lower,
      phone,
      passwordHash,
    };
    state.users.push(user);
  } else {
    user.name = name;
    user.phone = phone;
    user.passwordHash = passwordHash;
    user.role = role;
  }
  return user;
}

function seedDoctorAvailability(doctorId) {
  const slots = ["09:00", "09:15", "09:30", "09:45", "10:00", "10:15", "10:30", "10:45", "11:00", "11:15", "11:30",
    "13:00", "13:15", "13:30", "13:45", "14:00", "14:15", "14:30", "14:45", "15:00", "15:15", "15:30", "15:45", "16:00"];
  for (let i = 1; i <= 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const date = d.toISOString().slice(0, 10);
    const has = state.availability.some((s) => s.doctorId === doctorId && s.date === date);
    if (!has) setDoctorAvailability(doctorId, date, slots);
  }
}

function ensureDemoPatient(doctor) {
  const demoEmail = "demo@crossroads.clinic";
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const followUp = new Date(today);
  followUp.setDate(followUp.getDate() + 14);
  const followUpIso = followUp.toISOString().slice(0, 10);

  let patient = state.patients.find((p) => p.email === demoEmail);
  if (!patient) {
    patient = {
      id: uid("PT"),
      role: "patient",
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      name: "Jordan Mitchell",
      email: demoEmail,
      phone: "0412 345 678",
      state: "NSW",
      support: "Sleep and evening routine support",
      passwordHash: hashPassword("demo1234"),
      paid: true,
      paidAt: new Date(Date.now() - 28 * 86400000).toISOString(),
      stage: "Portal active",
      assignedDoctorId: doctor.id,
    };
    state.patients.push(patient);
  } else {
    Object.assign(patient, {
      name: "Jordan Mitchell",
      phone: "0412 345 678",
      state: "NSW",
      support: "Sleep and evening routine support",
      passwordHash: hashPassword("demo1234"),
      paid: true,
      stage: "Portal active",
      assignedDoctorId: doctor.id,
    });
  }

  state.appointments = state.appointments.filter((a) => a.patientId !== patient.id);
  state.prescriptions = state.prescriptions.filter((r) => r.patientId !== patient.id);
  state.orders = state.orders.filter((o) => o.patientId !== patient.id);

  state.appointments.push(
    {
      id: uid("APT"),
      patientId: patient.id,
      date: todayIso,
      time: "14:30",
      clinician: doctor.name,
      format: "Phone consult",
      status: "confirmed",
      type: "Follow-up consult",
      fee: CONSULT_FEE,
      doctorId: doctor.id,
      durationMinutes: APPOINTMENT_MINUTES,
      telehealthStatus: "scheduled",
    },
    {
      id: uid("APT"),
      patientId: patient.id,
      date: followUpIso,
      time: "10:00",
      clinician: doctor.name,
      doctorId: doctor.id,
      format: "Phone consult",
      status: "confirmed",
      type: "Interval check-in",
      fee: CONSULT_FEE,
      durationMinutes: APPOINTMENT_MINUTES,
      telehealthStatus: "scheduled",
    }
  );

  const prescribedAt = new Date(Date.now() - 35 * 86400000).toISOString();
  state.prescriptions.push(
    {
      id: uid("RX"),
      patientId: patient.id,
      name: "Holistic sleep support — Flower",
      form: "Dried herb · 10g",
      repeats: 4,
      repeatsTotal: 5,
      status: "active",
      intervalDays: 28,
      prescribedAt,
      nextReorderAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      prescribedBy: doctor.id,
      notes: "Evening use as discussed. Reorder is ready now for demo.",
    },
    {
      id: uid("RX"),
      patientId: patient.id,
      name: "Calm routine — Oil",
      form: "Oral oil · 30ml",
      repeats: 2,
      repeatsTotal: 5,
      status: "reorder_requested",
      intervalDays: 28,
      prescribedAt: new Date(Date.now() - 60 * 86400000).toISOString(),
      nextReorderAt: new Date(Date.now() + 26 * 86400000).toISOString(),
      prescribedBy: doctor.id,
      notes: "Pending pharmacy dispatch — visible in admin queue.",
    },
    {
      id: uid("RX"),
      patientId: patient.id,
      name: "Evening calm — Capsules",
      form: "Capsules · 30 pack",
      repeats: 5,
      repeatsTotal: 5,
      status: "pending_dispense",
      intervalDays: 28,
      prescribedAt: null,
      nextReorderAt: null,
      prescribedBy: doctor.id,
      submittedAt: new Date(Date.now() - 3600000).toISOString(),
      notes: "Doctor submitted — awaiting admin dispense.",
    }
  );

  state.orders.push({
    id: uid("ORD"),
    patientId: patient.id,
    items: [
      { id: "vaporiser-mini", name: "Portable dry herb vaporiser", price: 89, qty: 1 },
      { id: "storage-jar", name: "UV storage jar", price: 18, qty: 2 },
    ],
    total: 125,
    status: "processing",
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  });

  return patient;
}

function ensureDemoAccounts() {
  const adminPassword = process.env.ADMIN_PASSWORD || "CrossroadsAdmin2026";
  const doctorPassword = process.env.DOCTOR_PASSWORD || "Doctor2026";

  const admin = upsertStaffUser({
    role: "admin",
    name: "Crossroads Admin",
    email: "admin@crossroads.clinic",
    phone: "1800 000 000",
    password: adminPassword,
  });

  const doctor = upsertStaffUser({
    role: "doctor",
    name: "Dr Patel",
    email: "dr.patel@crossroads.clinic",
    phone: "0411 222 333",
    password: doctorPassword,
  });

  upsertStaffUser({
    role: "doctor",
    name: "Dr Nguyen",
    email: "dr.nguyen@crossroads.clinic",
    phone: "0411 444 555",
    password: doctorPassword,
  });

  ensureDemoPatient(doctor);
  seedDoctorAvailability(doctor.id);
  persist();

  console.log("Demo accounts ready:");
  console.log("  Patient: demo@crossroads.clinic / demo1234");
  console.log("  Doctor:  dr.patel@crossroads.clinic");
  console.log("  Admin:   admin@crossroads.clinic");
}

ensureDemoAccounts();

module.exports = {
  CONSULT_FEE,
  APPOINTMENT_MINUTES,
  login,
  clearToken,
  getSession,
  registerPatient,
  getPatientBundle,
  listPatients,
  listDoctors,
  updatePrescription,
  createPrescription,
  dispensePrescription,
  startTelehealth,
  completeTelehealth,
  requestReorder,
  placeOrder,
  adminOverview,
  adminCreatePatient,
  updatePatient,
  updateAppointment,
  doctorQueue,
  getBookingSlots,
  getDoctorAvailability,
  setDoctorAvailability,
  sanitizePatient,
};