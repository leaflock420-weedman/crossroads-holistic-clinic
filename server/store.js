const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { sendElectronicPrescription } = require("./erx");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "clinic-live.json");
const CONSULT_FEE = 49;
const APPOINTMENT_MINUTES = 15;
const NEW_PATIENT_MINUTES = 30;

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
    changeRequests: [],
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
  const user = findUserByEmail(String(email || "").trim());
  const pwd = String(password || "").trim();
  if (!user || user.passwordHash !== hashPassword(pwd)) {
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
      durationMinutes: NEW_PATIENT_MINUTES,
      patientType: "new",
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
    changeRequests: state.changeRequests.filter((c) => c.patientId === patientId),
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
  if (actor?.role === "doctor") {
    nextPatch.status = "pending_dispense";
    nextPatch.submittedAt = new Date().toISOString();
    if (nextPatch.intervalDays !== undefined) {
      nextPatch.intervalDays = Math.max(1, Number(nextPatch.intervalDays));
    }
  }
  Object.assign(rx, nextPatch, { updatedAt: new Date().toISOString(), prescribedBy: actorId });
  persist();
  return { ok: true, prescription: rx };
}

function approvePrescription(id, actorId) {
  const rx = state.prescriptions.find((r) => r.id === id);
  if (!rx) return { ok: false, error: "Prescription not found." };
  if (!["pending_dispense", "pending_review", "reorder_requested"].includes(rx.status)) {
    return { ok: false, error: "Script is not awaiting approval." };
  }
  const patient = state.patients.find((p) => p.id === rx.patientId);
  const prescriber = state.users.find((u) => u.id === (rx.prescribedBy || actorId));
  const erx = sendElectronicPrescription(rx, patient, prescriber);

  rx.status = "active";
  rx.approvedAt = new Date().toISOString();
  rx.approvedBy = actorId;
  rx.dispensedAt = rx.approvedAt;
  rx.dispensedBy = actorId;
  rx.erxToken = erx.erxToken;
  rx.erxScriptId = erx.erxScriptId;
  rx.erxStatus = erx.erxStatus;
  rx.erxSentAt = erx.erxSentAt;
  rx.ausscriptsUrl = erx.ausscriptsUrl;
  if (!rx.prescribedAt) rx.prescribedAt = rx.dispensedAt;
  if (!rx.nextReorderAt) {
    rx.nextReorderAt = new Date(Date.now() + (rx.intervalDays || 28) * 86400000).toISOString();
  }
  persist();
  return { ok: true, prescription: rx, erx, approved: true };
}

const dispensePrescription = approvePrescription;

function updatePatientProfile(patientId, patch) {
  const patient = state.patients.find((p) => p.id === patientId);
  if (!patient) return { ok: false, error: "Patient not found." };
  const allowed = ["addressLine1", "addressLine2", "suburb", "postcode", "phone", "support"];
  allowed.forEach((k) => {
    if (patch[k] !== undefined) patient[k] = patch[k];
  });
  persist();
  return { ok: true, patient: sanitizePatient(patient) };
}

function createPrescription(patientId, data, actorId) {
  const actor = state.users.find((u) => u.id === actorId);
  let status = data.status || "pending_dispense";
  if (actor?.role === "doctor") status = "pending_dispense";
  if (actor?.role === "admin" && data.releaseNow) status = "active";

  const patient = state.patients.find((p) => p.id === patientId);
  const hasActive = state.prescriptions.some((r) => r.patientId === patientId && r.status === "active");
  const supplyDays = Number(data.supplyDays ?? (hasActive ? 60 : 30));
  const intervalDays = Math.max(1, Number(data.intervalDays ?? supplyDays));

  const rx = {
    id: uid("RX"),
    patientId,
    name: data.name,
    form: data.form || "",
    repeats: Number(data.repeats ?? 5),
    repeatsTotal: Number(data.repeatsTotal ?? 5),
    status,
    supplyDays,
    intervalDays,
    nextReorderAt: status === "active"
      ? data.nextReorderAt || new Date(Date.now() + intervalDays * 86400000).toISOString()
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

function placeOrder(patientId, items, options = {}) {
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const delivery = options.delivery || "pickup";
  const shippingFee = delivery === "signature" ? 25 : delivery === "post" ? 20 : 0;
  const order = {
    id: uid("ORD"),
    patientId,
    items,
    subtotal,
    delivery,
    shippingFee,
    total: subtotal + shippingFee,
    status: "processing",
    createdAt: new Date().toISOString(),
  };
  state.orders.push(order);
  persist();
  return { ok: true, order };
}

function updateOrder(id, patch) {
  const order = state.orders.find((o) => o.id === id);
  if (!order) return { ok: false, error: "Order not found." };
  if (patch.status) order.status = patch.status;
  if (patch.notes !== undefined) order.notes = patch.notes;
  order.updatedAt = new Date().toISOString();
  persist();
  return { ok: true, order };
}

function cancelAppointment(id, actorId) {
  const apt = state.appointments.find((a) => a.id === id);
  if (!apt) return { ok: false, error: "Appointment not found." };
  if (apt.status === "cancelled") return { ok: false, error: "Appointment already cancelled." };
  apt.status = "cancelled";
  apt.telehealthStatus = "cancelled";
  apt.cancelledAt = new Date().toISOString();
  apt.cancelledBy = actorId || null;
  persist();
  return { ok: true, appointment: apt };
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
      changeRequests: state.changeRequests.filter((c) => c.status === "pending").length,
      orders: state.orders.length,
    },
    changeRequests: state.changeRequests.filter((c) => c.status === "pending"),
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
  if (patch.assignedDoctorId !== undefined) {
    const doctor = patch.assignedDoctorId ? resolveDoctor(patch.assignedDoctorId) : null;
    patch.assignedDoctorId = doctor?.id || patch.assignedDoctorId || null;
    state.appointments
      .filter(
        (a) =>
          a.patientId === id &&
          a.status !== "cancelled" &&
          a.status !== "completed" &&
          a.telehealthStatus !== "completed"
      )
      .forEach((a) => {
        if (doctor) {
          a.doctorId = doctor.id;
          a.clinician = doctor.name;
        }
      });
  }
  Object.assign(patient, patch);
  persist();
  return { ok: true, patient: sanitizePatient(patient) };
}

function updateAppointment(id, patch) {
  const apt = state.appointments.find((a) => a.id === id);
  if (!apt) return { ok: false, error: "Appointment not found." };
  if (patch.doctorId || patch.clinician) {
    const doctor = resolveDoctor(patch.doctorId, patch.clinician);
    if (doctor) {
      patch.doctorId = doctor.id;
      patch.clinician = doctor.name;
    }
  }
  Object.assign(apt, patch);
  if (patch.doctorId && apt.patientId) {
    const patient = state.patients.find((p) => p.id === apt.patientId);
    if (patient) patient.assignedDoctorId = patch.doctorId;
  }
  persist();
  return { ok: true, appointment: apt };
}

function createAppointment(payload) {
  const patient = state.patients.find((p) => p.id === payload.patientId);
  if (!patient) return { ok: false, error: "Patient not found." };
  const doctor = resolveDoctor(payload.doctorId || patient.assignedDoctorId, payload.clinician);
  const isNew = payload.patientType === "new" || /initial/i.test(payload.type || "");
  const apt = {
    id: uid("APT"),
    patientId: patient.id,
    date: payload.date,
    time: payload.time,
    doctorId: doctor?.id || payload.doctorId || null,
    clinician: doctor?.name || payload.clinician || "Assigned clinician",
    format: payload.format || "Phone consult",
    status: "confirmed",
    type: payload.type || (isNew ? "Initial consult" : "Follow-up consult"),
    patientType: isNew ? "new" : "existing",
    fee: CONSULT_FEE,
    durationMinutes: payload.durationMinutes || (isNew ? NEW_PATIENT_MINUTES : APPOINTMENT_MINUTES),
    telehealthStatus: "scheduled",
    scheduledBy: payload.scheduledBy || null,
  };
  state.appointments.push(apt);
  if (doctor) patient.assignedDoctorId = doctor.id;
  persist();
  return { ok: true, appointment: apt };
}

function requestMedicationChange(patientId, prescriptionId, body) {
  const rx = state.prescriptions.find((r) => r.id === prescriptionId && r.patientId === patientId);
  if (!rx) return { ok: false, error: "Prescription not found." };
  if (!["active", "reorder_requested"].includes(rx.status)) {
    return { ok: false, error: "Only active scripts can be changed." };
  }
  const open = state.changeRequests.find(
    (c) => c.prescriptionId === prescriptionId && c.status === "pending"
  );
  if (open) return { ok: false, error: "You already have a change request awaiting review." };

  const req = {
    id: uid("CHG"),
    patientId,
    prescriptionId,
    currentName: rx.name,
    currentForm: rx.form,
    requestedForm: body.requestedForm || "",
    requestedProduct: body.requestedProduct || "",
    reason: body.reason || "out_of_stock",
    notes: body.notes || "",
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  state.changeRequests.push(req);
  persist();
  return { ok: true, changeRequest: req };
}

function approveChangeRequest(id, doctorId, patch) {
  const req = state.changeRequests.find((c) => c.id === id);
  if (!req) return { ok: false, error: "Change request not found." };
  if (req.status !== "pending") return { ok: false, error: "Request already processed." };
  const rx = state.prescriptions.find((r) => r.id === req.prescriptionId);
  if (!rx) return { ok: false, error: "Prescription not found." };

  const nextName = patch.name || req.requestedProduct || rx.name;
  const nextForm = patch.form || req.requestedForm || rx.form;
  Object.assign(rx, {
    name: nextName,
    form: nextForm,
    status: "pending_dispense",
    submittedAt: new Date().toISOString(),
    prescribedBy: doctorId,
    notes: patch.notes || `Approved change: ${req.reason}. ${req.notes || ""}`.trim(),
    updatedAt: new Date().toISOString(),
  });
  req.status = "approved";
  req.reviewedAt = new Date().toISOString();
  req.reviewedBy = doctorId;
  persist();
  return { ok: true, changeRequest: req, prescription: rx };
}

function denyChangeRequest(id, doctorId, reason) {
  const req = state.changeRequests.find((c) => c.id === id);
  if (!req) return { ok: false, error: "Change request not found." };
  if (req.status !== "pending") return { ok: false, error: "Request already processed." };
  req.status = "denied";
  req.reviewedAt = new Date().toISOString();
  req.reviewedBy = doctorId;
  req.denyReason = reason || "Clinician could not approve this change.";
  persist();
  return { ok: true, changeRequest: req };
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
    const changeRequests = state.changeRequests.filter(
      (c) => c.patientId === apt.patientId && c.status === "pending"
    );
    return {
      appointment: apt,
      patient: sanitizePatient(patient),
      prescriptions,
      changeRequests,
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

function upsertDemoPatient(profile, doctor) {
  const email = profile.email.toLowerCase();
  let patient = state.patients.find((p) => p.email === email);
  const base = {
    role: "patient",
    name: profile.name,
    email,
    phone: profile.phone,
    state: profile.state,
    support: profile.support,
    passwordHash: hashPassword(profile.password || "demo1234"),
    paid: true,
    paidAt: new Date(Date.now() - 28 * 86400000).toISOString(),
    stage: "Portal active",
    assignedDoctorId: doctor.id,
  };
  if (!patient) {
    patient = { id: uid("PT"), createdAt: new Date(Date.now() - 30 * 86400000).toISOString(), ...base };
    state.patients.push(patient);
  } else {
    Object.assign(patient, base);
  }

  state.appointments = state.appointments.filter((a) => a.patientId !== patient.id);
  state.prescriptions = state.prescriptions.filter((r) => r.patientId !== patient.id);
  state.orders = state.orders.filter((o) => o.patientId !== patient.id);

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);
  const followUp = new Date();
  followUp.setDate(followUp.getDate() + 14);
  const followUpIso = followUp.toISOString().slice(0, 10);

  for (const apt of profile.appointments || []) {
    const isNew = apt.patientType === "new" || /initial/i.test(apt.type || "");
    state.appointments.push({
      id: uid("APT"),
      patientId: patient.id,
      doctorId: doctor.id,
      clinician: doctor.name,
      format: "Phone consult",
      status: "confirmed",
      fee: CONSULT_FEE,
      patientType: isNew ? "new" : "existing",
      durationMinutes: apt.durationMinutes || (isNew ? NEW_PATIENT_MINUTES : APPOINTMENT_MINUTES),
      telehealthStatus: "scheduled",
      ...apt,
    });
  }

  for (const rx of profile.prescriptions || []) {
    state.prescriptions.push({
      id: uid("RX"),
      patientId: patient.id,
      prescribedBy: doctor.id,
      intervalDays: 28,
      ...rx,
    });
  }

  if (profile.order) {
    state.orders.push({ id: uid("ORD"), patientId: patient.id, ...profile.order });
  }

  return patient;
}

function ensureDemoPatients(doctors) {
  const patel = doctors.patel;
  const nguyen = doctors.nguyen;

  upsertDemoPatient(
    {
      email: "demo@crossroads.clinic",
      name: "Jordan Mitchell",
      phone: "0412 345 678",
      state: "NSW",
      support: "Sleep and evening routine support",
      appointments: [
        { date: new Date().toISOString().slice(0, 10), time: "14:30", type: "Follow-up consult", patientType: "existing", telehealthStatus: "scheduled" },
        { date: followUpIsoFromNow(14), time: "10:00", type: "Interval check-in", patientType: "existing", telehealthStatus: "scheduled" },
      ],
      prescriptions: [
        {
          name: "Holistic sleep support — Flower",
          form: "Dried herb · 10g",
          repeats: 4,
          repeatsTotal: 5,
          status: "active",
          prescribedAt: new Date(Date.now() - 35 * 86400000).toISOString(),
          nextReorderAt: new Date(Date.now() - 2 * 86400000).toISOString(),
          notes: "Evening use as discussed. Reorder is ready now for demo.",
        },
        {
          name: "Calm routine — Oil",
          form: "Oral oil · 30ml",
          repeats: 2,
          repeatsTotal: 5,
          status: "reorder_requested",
          prescribedAt: new Date(Date.now() - 60 * 86400000).toISOString(),
          nextReorderAt: new Date(Date.now() + 26 * 86400000).toISOString(),
          notes: "Pending pharmacy dispatch — visible in admin queue.",
        },
        {
          name: "Evening calm — Capsules",
          form: "Capsules · 30 pack",
          repeats: 5,
          repeatsTotal: 5,
          status: "pending_dispense",
          prescribedAt: null,
          nextReorderAt: null,
          submittedAt: new Date(Date.now() - 3600000).toISOString(),
          notes: "Doctor submitted — awaiting admin dispense.",
        },
      ],
      order: {
        items: [
          { id: "vaporiser-mini", name: "Portable dry herb vaporiser", price: 89, qty: 1 },
          { id: "storage-jar", name: "UV storage jar", price: 18, qty: 2 },
        ],
        total: 125,
        status: "processing",
        createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      },
    },
    patel
  );

  upsertDemoPatient(
    {
      email: "alex@crossroads.clinic",
      name: "Alex Taylor",
      phone: "0423 111 222",
      state: "VIC",
      support: "Daytime focus and routine",
      appointments: [
        { date: new Date().toISOString().slice(0, 10), time: "10:15", type: "Initial consult", patientType: "new", telehealthStatus: "scheduled" },
      ],
      prescriptions: [
        {
          name: "Treatment plan pending review",
          form: "As prescribed after consult",
          repeats: 0,
          repeatsTotal: 5,
          status: "pending_review",
          prescribedAt: null,
          nextReorderAt: null,
          notes: "Awaiting first consult with Dr Nguyen.",
        },
      ],
    },
    nguyen
  );

  upsertDemoPatient(
    {
      email: "sam@crossroads.clinic",
      name: "Sam Rivera",
      phone: "0434 555 666",
      state: "QLD",
      support: "Pain and mobility support",
      appointments: [
        {
          date: new Date().toISOString().slice(0, 10),
          time: "09:00",
          type: "Follow-up consult",
          telehealthStatus: "completed",
          status: "completed",
          patientType: "existing",
        },
      ],
      prescriptions: [
        {
          name: "Mobility support — Flower",
          form: "Dried herb · 15g",
          repeats: 3,
          repeatsTotal: 5,
          status: "active",
          prescribedAt: new Date(Date.now() - 20 * 86400000).toISOString(),
          nextReorderAt: new Date(Date.now() + 8 * 86400000).toISOString(),
          erxToken: "DEMO8RX1",
          erxScriptId: "ERX-DEMO-SAM",
          erxStatus: "sent",
          erxSentAt: new Date(Date.now() - 20 * 86400000).toISOString(),
          ausscriptsUrl: "https://ausscripts.erx.com.au/?token=DEMO8RX1",
          notes: "Electronic script sent via eRx — present token at pharmacy.",
        },
      ],
    },
    patel
  );

  upsertDemoPatient(
    {
      email: "morgan@crossroads.clinic",
      name: "Morgan Lee",
      phone: "0445 777 888",
      state: "WA",
      support: "Anxiety and sleep balance",
      appointments: [
        { date: tomorrowIsoFromNow(), time: "11:00", type: "Initial consult", patientType: "new", telehealthStatus: "scheduled" },
      ],
      prescriptions: [
        {
          name: "Treatment plan pending review",
          form: "As prescribed after consult",
          repeats: 0,
          repeatsTotal: 5,
          status: "pending_review",
          prescribedAt: null,
          nextReorderAt: null,
          notes: "Booked with Dr Nguyen — consult tomorrow.",
        },
      ],
    },
    nguyen
  );
}

function followUpIsoFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function tomorrowIsoFromNow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
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

  const doctorNguyen = upsertStaffUser({
    role: "doctor",
    name: "Dr Nguyen",
    email: "dr.nguyen@crossroads.clinic",
    phone: "0411 444 555",
    password: doctorPassword,
  });

  ensureDemoPatients({ patel: doctor, nguyen: doctorNguyen });
  seedDoctorAvailability(doctor.id);
  seedDoctorAvailability(doctorNguyen.id);
  persist();

  console.log("Demo accounts ready:");
  console.log("  Patients: demo@ / alex@ / sam@ / morgan@crossroads.clinic — password demo1234");
  console.log("  Doctors:  dr.patel@ / dr.nguyen@crossroads.clinic — password Doctor2026");
  console.log("  Admin:    admin@crossroads.clinic");
}

ensureDemoAccounts();

module.exports = {
  CONSULT_FEE,
  APPOINTMENT_MINUTES,
  NEW_PATIENT_MINUTES,
  login,
  clearToken,
  getSession,
  registerPatient,
  getPatientBundle,
  listPatients,
  listDoctors,
  updatePrescription,
  createPrescription,
  approvePrescription,
  dispensePrescription,
  updatePatientProfile,
  startTelehealth,
  completeTelehealth,
  requestReorder,
  placeOrder,
  updateOrder,
  cancelAppointment,
  adminOverview,
  adminCreatePatient,
  updatePatient,
  updateAppointment,
  createAppointment,
  requestMedicationChange,
  approveChangeRequest,
  denyChangeRequest,
  doctorQueue,
  getBookingSlots,
  getDoctorAvailability,
  setDoctorAvailability,
  sanitizePatient,
};