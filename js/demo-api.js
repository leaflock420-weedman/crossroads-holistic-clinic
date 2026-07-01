import { generateTimeSlots, APPOINTMENT_MINUTES, NEW_PATIENT_MINUTES } from "./data.js";
import { notifyClinicUpdate } from "./sync.js";

const DEMO_STATE_KEY = "crossroads-demo-state-v6";
const LEGACY_STATE_KEYS = ["crossroads-demo-state-v5", "crossroads-demo-state-v4"];

const DEMO_ACCOUNTS = {
  "demo@crossroads.clinic": { password: "demo1234", role: "patient" },
  "alex@crossroads.clinic": { password: "demo1234", role: "patient" },
  "sam@crossroads.clinic": { password: "demo1234", role: "patient" },
  "morgan@crossroads.clinic": { password: "demo1234", role: "patient" },
  "dr.patel@crossroads.clinic": { password: "Doctor2026", role: "doctor" },
  "dr.nguyen@crossroads.clinic": { password: "Doctor2026", role: "doctor" },
  "admin@crossroads.clinic": { password: "CrossroadsAdmin2026", role: "admin" },
};

export function isKnownDemoEmail(email) {
  return Boolean(DEMO_ACCOUNTS[String(email || "").toLowerCase().trim()]);
}

function generateErxToken() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let token = "";
  for (let i = 0; i < 8; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function uid(prefix) {
  return `${prefix}-DEMO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function seedAvailability(state, doctorId) {
  const slots = generateTimeSlots();
  for (let i = 1; i <= 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const date = d.toISOString().slice(0, 10);
    const has = state.availability.some((s) => s.doctorId === doctorId && s.date === date);
    if (!has) {
      slots.forEach((time) => {
        state.availability.push({
          id: `AVL-DEMO-${doctorId}-${date}-${time}`,
          doctorId,
          date,
          time,
          durationMinutes: APPOINTMENT_MINUTES,
        });
      });
    }
  }
}

function offsetDateIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildInitialState() {
  const today = todayIso();
  const doctor = {
    id: "DOC-DEMO-PATEL",
    role: "doctor",
    name: "Dr Patel",
    email: "dr.patel@crossroads.clinic",
    phone: "0411 222 333",
  };
  const doctor2 = {
    id: "DOC-DEMO-NGUYEN",
    role: "doctor",
    name: "Dr Nguyen",
    email: "dr.nguyen@crossroads.clinic",
    phone: "0411 444 555",
  };
  const admin = {
    id: "ADM-DEMO",
    role: "admin",
    name: "Crossroads Admin",
    email: "admin@crossroads.clinic",
    phone: "1800 000 000",
  };

  const jordan = {
    id: "PT-DEMO-JORDAN",
    role: "patient",
    name: "Jordan Mitchell",
    email: "demo@crossroads.clinic",
    phone: "0412 345 678",
    state: "NSW",
    support: "Sleep and evening routine support",
    stage: "Portal active",
    paid: true,
    assignedDoctorId: doctor.id,
  };
  const alex = {
    id: "PT-DEMO-ALEX",
    role: "patient",
    name: "Alex Taylor",
    email: "alex@crossroads.clinic",
    phone: "0423 111 222",
    state: "VIC",
    support: "Daytime focus and routine",
    stage: "Portal active",
    paid: true,
    assignedDoctorId: doctor2.id,
  };
  const sam = {
    id: "PT-DEMO-SAM",
    role: "patient",
    name: "Sam Rivera",
    email: "sam@crossroads.clinic",
    phone: "0434 555 666",
    state: "QLD",
    support: "Pain and mobility support",
    stage: "Portal active",
    paid: true,
    assignedDoctorId: doctor.id,
  };
  const morgan = {
    id: "PT-DEMO-MORGAN",
    role: "patient",
    name: "Morgan Lee",
    email: "morgan@crossroads.clinic",
    phone: "0445 777 888",
    state: "WA",
    support: "Anxiety and sleep balance",
    stage: "Portal active",
    paid: true,
    assignedDoctorId: doctor2.id,
  };

  const state = {
    users: { [doctor.id]: doctor, [doctor2.id]: doctor2, [admin.id]: admin },
    patients: {
      [jordan.id]: jordan,
      [alex.id]: alex,
      [sam.id]: sam,
      [morgan.id]: morgan,
    },
    appointments: [
      {
        id: "APT-DEMO-JORDAN-1",
        patientId: jordan.id,
        date: today,
        time: "14:30",
        clinician: doctor.name,
        doctorId: doctor.id,
        format: "Phone consult",
        status: "confirmed",
        type: "Follow-up consult",
        patientType: "existing",
        fee: 49,
        durationMinutes: APPOINTMENT_MINUTES,
        telehealthStatus: "scheduled",
      },
      {
        id: "APT-DEMO-JORDAN-2",
        patientId: jordan.id,
        date: offsetDateIso(14),
        time: "10:00",
        clinician: doctor.name,
        doctorId: doctor.id,
        format: "Phone consult",
        status: "confirmed",
        type: "Interval check-in",
        patientType: "existing",
        fee: 49,
        durationMinutes: APPOINTMENT_MINUTES,
        telehealthStatus: "scheduled",
      },
      {
        id: "APT-DEMO-ALEX-1",
        patientId: alex.id,
        date: today,
        time: "10:15",
        clinician: doctor2.name,
        doctorId: doctor2.id,
        format: "Phone consult",
        status: "confirmed",
        type: "Initial consult",
        patientType: "new",
        fee: 49,
        durationMinutes: NEW_PATIENT_MINUTES,
        telehealthStatus: "scheduled",
      },
      {
        id: "APT-DEMO-SAM-1",
        patientId: sam.id,
        date: today,
        time: "09:00",
        clinician: doctor.name,
        doctorId: doctor.id,
        format: "Phone consult",
        status: "completed",
        type: "Follow-up consult",
        patientType: "existing",
        fee: 49,
        durationMinutes: APPOINTMENT_MINUTES,
        telehealthStatus: "completed",
      },
      {
        id: "APT-DEMO-MORGAN-1",
        patientId: morgan.id,
        date: offsetDateIso(1),
        time: "11:00",
        clinician: doctor2.name,
        doctorId: doctor2.id,
        format: "Phone consult",
        status: "confirmed",
        type: "Initial consult",
        patientType: "new",
        fee: 49,
        durationMinutes: NEW_PATIENT_MINUTES,
        telehealthStatus: "scheduled",
      },
    ],
    prescriptions: [
      {
        id: "RX-DEMO-ACTIVE",
        patientId: jordan.id,
        name: "Holistic sleep support — Flower",
        form: "Dried herb · 10g",
        repeats: 4,
        repeatsTotal: 5,
        status: "active",
        intervalDays: 28,
        prescribedAt: new Date(Date.now() - 35 * 86400000).toISOString(),
        nextReorderAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        prescribedBy: doctor.id,
        notes: "Evening use as discussed. Reorder is ready now for demo.",
      },
      {
        id: "RX-DEMO-REORDER",
        patientId: jordan.id,
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
        id: "RX-DEMO-PENDING",
        patientId: jordan.id,
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
      },
      {
        id: "RX-DEMO-ALEX",
        patientId: alex.id,
        name: "Treatment plan pending review",
        form: "As prescribed after consult",
        repeats: 0,
        repeatsTotal: 5,
        status: "pending_review",
        intervalDays: 28,
        prescribedAt: null,
        nextReorderAt: null,
        prescribedBy: doctor2.id,
        notes: "Awaiting first consult with Dr Nguyen.",
      },
      {
        id: "RX-DEMO-SAM",
        patientId: sam.id,
        name: "Mobility support — Flower",
        form: "Dried herb · 15g",
        repeats: 3,
        repeatsTotal: 5,
        status: "active",
        intervalDays: 28,
        prescribedAt: new Date(Date.now() - 20 * 86400000).toISOString(),
        nextReorderAt: new Date(Date.now() + 8 * 86400000).toISOString(),
        prescribedBy: doctor.id,
        erxToken: "DEMO8RX1",
        erxScriptId: "ERX-DEMO-SAM",
        erxStatus: "sent",
        erxSentAt: new Date(Date.now() - 20 * 86400000).toISOString(),
        ausscriptsUrl: "https://ausscripts.erx.com.au/?token=DEMO8RX1",
        notes: "Electronic script sent via eRx — present token at pharmacy.",
      },
      {
        id: "RX-DEMO-MORGAN",
        patientId: morgan.id,
        name: "Treatment plan pending review",
        form: "As prescribed after consult",
        repeats: 0,
        repeatsTotal: 5,
        status: "pending_review",
        intervalDays: 28,
        prescribedAt: null,
        nextReorderAt: null,
        prescribedBy: doctor2.id,
        notes: "Booked with Dr Nguyen — consult tomorrow.",
      },
    ],
    orders: [
      {
        id: "ORD-DEMO-1",
        patientId: jordan.id,
        items: [
          { id: "vaporiser-mini", name: "Portable dry herb vaporiser", price: 89, qty: 1 },
          { id: "storage-jar", name: "UV storage jar", price: 18, qty: 2 },
        ],
        total: 125,
        status: "processing",
        createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      },
    ],
    availability: [],
    changeRequests: [],
    sessions: {},
  };
  seedAvailability(state, doctor.id);
  seedAvailability(state, doctor2.id);
  return state;
}

function loadDemoState() {
  try {
    const raw = localStorage.getItem(DEMO_STATE_KEY);
    if (raw) return JSON.parse(raw);
    for (const legacyKey of LEGACY_STATE_KEYS) {
      const legacy =
        localStorage.getItem(legacyKey) || sessionStorage.getItem(legacyKey);
      if (legacy) {
        localStorage.setItem(DEMO_STATE_KEY, legacy);
        localStorage.removeItem(legacyKey);
        sessionStorage.removeItem(legacyKey);
        return JSON.parse(legacy);
      }
    }
  } catch {}
  const state = buildInitialState();
  saveDemoState(state);
  return state;
}

function saveDemoState(state) {
  localStorage.setItem(DEMO_STATE_KEY, JSON.stringify(state));
  notifyClinicUpdate();
}

function patientName(state, id) {
  return state.patients[id]?.name || id;
}

function getSession(state, token) {
  const session = state.sessions[token];
  if (!session) return null;
  const user = state.patients[session.userId] || state.users[session.userId];
  return user ? { token, user, role: session.role } : null;
}

function patientBundle(state, patientId) {
  const patient = state.patients[patientId];
  if (!patient) return null;
  return {
    patient,
    appointments: state.appointments.filter((a) => a.patientId === patientId),
    prescriptions: state.prescriptions.filter((r) => r.patientId === patientId),
    orders: state.orders.filter((o) => o.patientId === patientId),
    changeRequests: state.changeRequests.filter((c) => c.patientId === patientId),
  };
}

function listDoctors(state) {
  return Object.values(state.users).filter((u) => u.role === "doctor");
}

function resolveDoctor(state, doctorId, clinicianName) {
  if (doctorId) {
    const d = state.users[doctorId];
    if (d?.role === "doctor") return d;
  }
  if (clinicianName) {
    return Object.values(state.users).find((u) => u.role === "doctor" && u.name === clinicianName) || null;
  }
  return null;
}

function getAvailableSlots(state, doctorId, date) {
  const open = state.availability.filter((s) => s.doctorId === doctorId && s.date === date).map((s) => s.time);
  const booked = getBookedTimes(state, doctorId, date);
  return open.filter((t) => !booked.includes(t)).sort();
}

function validateDemoSlot(state, doctorId, date, time, excludeId = null) {
  const conflict = state.appointments.find(
    (a) =>
      a.id !== excludeId &&
      a.date === date &&
      a.time === time &&
      a.status !== "cancelled" &&
      (a.doctorId === doctorId || resolveDoctor(state, a.doctorId, a.clinician)?.id === doctorId)
  );
  if (conflict) throw new Error("That 15-minute slot is already booked. Pick another open time.");
  const available = getAvailableSlots(state, doctorId, date);
  if (!available.includes(time)) {
    throw new Error(
      available.length
        ? `That time is not available. Open slots: ${available.slice(0, 5).join(", ")}`
        : "No open slots this day — try another date."
    );
  }
}

function doctorQueue(state, doctorId) {
  const doctor = state.users[doctorId];
  const today = todayIso();
  const doctorChangeRequests = state.changeRequests.filter(
    (c) =>
      c.status === "with_doctor" &&
      (c.assignedDoctorId === doctorId || state.patients[c.patientId]?.assignedDoctorId === doctorId)
  );

  const appointmentList = state.appointments.filter((a) => {
    const patient = state.patients[a.patientId];
    const assigned =
      patient?.assignedDoctorId === doctorId ||
      a.doctorId === doctorId ||
      a.clinician === doctor?.name;
    if (!assigned && doctor?.role === "doctor") return false;
    if (doctorChangeRequests.some((c) => c.patientId === a.patientId)) return true;
    if (a.telehealthStatus === "in_progress") return true;
    if (a.status === "confirmed" && a.telehealthStatus !== "completed") return true;
    if (a.telehealthStatus === "completed" && a.date === today) return true;
    const pendingRx = state.prescriptions.some(
      (r) =>
        r.patientId === a.patientId &&
        ["pending_review", "pending_dispense", "reorder_requested"].includes(r.status)
    );
    return pendingRx && a.date >= today;
  });

  const seenPatients = new Set(appointmentList.map((a) => a.patientId));
  doctorChangeRequests.forEach((chg) => {
    if (seenPatients.has(chg.patientId)) return;
    const latest = state.appointments
      .filter((a) => a.patientId === chg.patientId)
      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))[0];
    if (latest) appointmentList.push(latest);
    else {
      appointmentList.push({
        id: `APT-CHG-${chg.id}`,
        patientId: chg.patientId,
        date: today,
        time: "—",
        doctorId,
        clinician: doctor?.name || "Clinician",
        format: "Medication change",
        status: "confirmed",
        type: "Change request review",
        patientType: "existing",
        fee: 0,
        durationMinutes: APPOINTMENT_MINUTES,
        telehealthStatus: "scheduled",
      });
    }
    seenPatients.add(chg.patientId);
  });

  return appointmentList
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .map((apt) => ({
      appointment: apt,
      patient: state.patients[apt.patientId],
      prescriptions: state.prescriptions.filter((r) => r.patientId === apt.patientId),
      changeRequests: state.changeRequests.filter(
        (c) => c.patientId === apt.patientId && c.status === "with_doctor"
      ),
    }));
}

function getBookedTimes(state, doctorId, date) {
  return state.appointments
    .filter(
      (a) =>
        a.date === date &&
        a.status !== "cancelled" &&
        (a.doctorId === doctorId || resolveDoctor(state, a.doctorId, a.clinician)?.id === doctorId)
    )
    .map((a) => a.time);
}

function parsePath(path) {
  const [pathname, query = ""] = path.split("?");
  const params = Object.fromEntries(new URLSearchParams(query));
  return { pathname, params };
}

function generateTempPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function resetDemoState() {
  localStorage.removeItem(DEMO_STATE_KEY);
  LEGACY_STATE_KEYS.forEach((k) => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
  loadDemoState();
}

export function demoApi(path, options = {}, token) {
  const state = loadDemoState();
  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  const { pathname, params } = parsePath(path);

  if (pathname === "/api/health") {
    return { ok: true, service: "crossroads-clinic", mode: "demo" };
  }

  if (pathname === "/api/auth/login" && method === "POST") {
    const email = String(body.email || "").toLowerCase().trim();
    const password = String(body.password || "").trim();
    const account = DEMO_ACCOUNTS[email];
    if (!account || account.password !== password) {
      throw new Error("Email or password not recognised.");
    }
    const user =
      account.role === "patient"
        ? Object.values(state.patients).find((p) => p.email === email)
        : Object.values(state.users).find((u) => u.email === email);
    const demoToken = `demo-${account.role}-${Date.now()}`;
    state.sessions[demoToken] = { userId: user.id, role: account.role };
    saveDemoState(state);
    return { ok: true, token: demoToken, user, role: account.role, mode: "demo" };
  }

  const session = getSession(state, token);
  if (!session && pathname !== "/api/config" && pathname !== "/api/doctors" && pathname !== "/api/booking/slots") {
    throw new Error("Unauthorized");
  }

  if (pathname === "/api/auth/me") {
    return { user: session.user, role: session.role, mode: "demo" };
  }

  if (pathname === "/api/config") {
    return { consultFee: 49, appointmentMinutes: APPOINTMENT_MINUTES, mode: "demo" };
  }

  if (pathname === "/api/doctors") {
    return { doctors: listDoctors(state), mode: "demo" };
  }

  if (pathname === "/api/booking/slots") {
    const { doctorId, date } = params;
    const doctor = state.users[doctorId];
    if (!doctor || doctor.role !== "doctor") throw new Error("Doctor not found");
    const open = state.availability.filter((s) => s.doctorId === doctorId && s.date === date).map((s) => s.time);
    const booked = getBookedTimes(state, doctorId, date);
    const available = open.filter((t) => !booked.includes(t)).sort();
    return { ok: true, doctor, date, available, booked, mode: "demo" };
  }

  if (pathname === "/api/patients/register" && method === "POST") {
    const exists = Object.values(state.patients).some(
      (p) => p.email.toLowerCase() === String(body.email || "").toLowerCase()
    );
    if (exists) throw new Error("An account with this email already exists.");
    const password = body.password || generateTempPassword();
    const doctor = resolveDoctor(state, body.assignedDoctorId || body.appointment?.doctorId, body.appointment?.clinician);
    const patient = {
      id: uid("PT"),
      role: "patient",
      name: body.name,
      email: String(body.email).toLowerCase(),
      phone: body.phone || "",
      state: body.state || "",
      support: body.support || "",
      paid: Boolean(body.paid),
      stage: body.paid ? "Portal active" : "Awaiting payment",
      assignedDoctorId: doctor?.id || body.assignedDoctorId || null,
    };
    state.patients[patient.id] = patient;
    if (body.appointment) {
      state.appointments.push({
        id: uid("APT"),
        patientId: patient.id,
        ...body.appointment,
        doctorId: doctor?.id || body.appointment.doctorId || null,
        clinician: doctor?.name || body.appointment.clinician || "First available",
        durationMinutes: APPOINTMENT_MINUTES,
        status: "confirmed",
        type: "Initial consult",
        fee: 49,
        format: body.appointment.format || "Phone consult",
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
    const demoToken = `demo-patient-${Date.now()}`;
    state.sessions[demoToken] = { userId: patient.id, role: "patient" };
    saveDemoState(state);
    return { ok: true, token: demoToken, patient, password, mode: "demo" };
  }

  if (pathname === "/api/patient/dashboard" && session.role === "patient") {
    const data = patientBundle(state, session.user.id);
    if (!data) throw new Error("Patient not found");
    return { ...data, mode: "demo" };
  }

  if (pathname.startsWith("/api/patient/prescriptions/") && pathname.endsWith("/change-request") && method === "POST") {
    const id = pathname.split("/")[4];
    const rx = state.prescriptions.find((r) => r.id === id && r.patientId === session.user.id);
    if (!rx) throw new Error("Prescription not found");
    if (!["active", "reorder_requested"].includes(rx.status)) throw new Error("Only active scripts can be changed.");
    if (state.changeRequests.some((c) => c.prescriptionId === id && c.status === "pending")) {
      throw new Error("You already have a change request awaiting review.");
    }
    const req = {
      id: uid("CHG"),
      patientId: session.user.id,
      prescriptionId: id,
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
    saveDemoState(state);
    return { ok: true, changeRequest: req, mode: "demo" };
  }

  if (pathname.startsWith("/api/patient/reorder/") && method === "POST") {
    const id = pathname.split("/").pop();
    const rx = state.prescriptions.find((r) => r.id === id);
    if (!rx) throw new Error("Prescription not found");
    rx.status = "reorder_requested";
    rx.repeats = Math.max(0, rx.repeats - 1);
    saveDemoState(state);
    return { ok: true, prescription: rx, mode: "demo" };
  }

  if (pathname === "/api/patient/orders" && method === "POST") {
    const items = body.items || [];
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const delivery = body.delivery || "pickup";
    const shippingFee = delivery === "signature" ? 25 : delivery === "post" ? 20 : 0;
    const order = {
      id: uid("ORD"),
      patientId: session.user.id,
      items,
      subtotal,
      delivery,
      shippingFee,
      total: subtotal + shippingFee,
      status: "processing",
      createdAt: new Date().toISOString(),
    };
    state.orders.push(order);
    saveDemoState(state);
    return { ok: true, order, mode: "demo" };
  }

  if (pathname === "/api/doctor/queue" && (session.role === "doctor" || session.role === "admin")) {
    return { queue: doctorQueue(state, session.user.id), mode: "demo" };
  }

  if (pathname.startsWith("/api/doctor/patients/")) {
    const id = pathname.split("/").pop();
    const data = patientBundle(state, id);
    if (!data) throw new Error("Patient not found");
    return { ...data, mode: "demo" };
  }

  if (pathname === "/api/doctor/availability" && method === "GET") {
    const doctorId = session.role === "doctor" ? session.user.id : params.doctorId;
    const date = params.date;
    if (!doctorId || !date) throw new Error("doctorId and date required");
    const slots = state.availability.filter((s) => s.doctorId === doctorId && s.date === date);
    return { slots, mode: "demo" };
  }

  if (pathname === "/api/doctor/availability" && method === "PUT") {
    const { date, times } = body;
    if (!date) throw new Error("date required");
    const doctorId = session.user.id;
    state.availability = state.availability.filter((s) => !(s.doctorId === doctorId && s.date === date));
    const unique = [...new Set(times || [])];
    unique.forEach((time) => {
      state.availability.push({
        id: uid("AVL"),
        doctorId,
        date,
        time,
        durationMinutes: APPOINTMENT_MINUTES,
      });
    });
    const slots = state.availability.filter((s) => s.doctorId === doctorId && s.date === date);
    saveDemoState(state);
    return { ok: true, slots, mode: "demo" };
  }

  if (pathname.startsWith("/api/prescriptions/") && method === "PUT") {
    const id = pathname.split("/").pop();
    const rx = state.prescriptions.find((r) => r.id === id);
    if (!rx) throw new Error("Prescription not found");
    const patch = { ...body };
    if (session.role === "doctor") {
      patch.status = "pending_dispense";
      patch.submittedAt = new Date().toISOString();
      if (patch.intervalDays !== undefined) patch.intervalDays = Math.max(1, Number(patch.intervalDays));
      if (patch.supplyDays !== undefined) patch.supplyDays = Number(patch.supplyDays);
    }
    Object.assign(rx, patch, { prescribedBy: session.user.id });
    saveDemoState(state);
    return { ok: true, prescription: rx, mode: "demo" };
  }

  if (pathname === "/api/prescriptions" && method === "POST") {
    let status = body.status || "pending_dispense";
    if (session.role === "doctor") status = "pending_dispense";
    const hasActive = state.prescriptions.some(
      (r) => r.patientId === body.patientId && r.status === "active"
    );
    const supplyDays = Number(body.supplyDays ?? (hasActive ? 60 : 30));
    const intervalDays = Math.max(1, Number(body.intervalDays ?? supplyDays));
    const rx = {
      id: uid("RX"),
      patientId: body.patientId,
      name: body.name,
      form: body.form || "",
      repeats: Number(body.repeats ?? 5),
      repeatsTotal: Number(body.repeatsTotal ?? 5),
      status,
      supplyDays,
      intervalDays,
      nextReorderAt: status === "active" ? new Date(Date.now() + intervalDays * 86400000).toISOString() : null,
      prescribedAt: status === "active" ? new Date().toISOString() : null,
      prescribedBy: session.user.id,
      submittedAt: new Date().toISOString(),
      notes: body.notes || "",
    };
    state.prescriptions.push(rx);
    saveDemoState(state);
    return { ok: true, prescription: rx, mode: "demo" };
  }

  if (pathname === "/api/patient/appointments" && method === "POST") {
    const patient = state.patients[session.user.id];
    if (!patient) throw new Error("Patient not found");
    const doctor = state.users[patient.assignedDoctorId];
    if (!doctor) throw new Error("No clinician assigned — contact the clinic.");
    validateDemoSlot(state, doctor.id, body.date, body.time);
    const isNew = body.patientType === "new";
    state.appointments.push({
      id: uid("APT"),
      patientId: patient.id,
      date: body.date,
      time: body.time,
      doctorId: doctor?.id,
      clinician: doctor?.name || "Your clinician",
      patientType: isNew ? "new" : "existing",
      durationMinutes: isNew ? NEW_PATIENT_MINUTES : APPOINTMENT_MINUTES,
      type: body.type || "Follow-up consult",
      format: "Phone consult",
      status: "confirmed",
      fee: 49,
      telehealthStatus: "scheduled",
    });
    saveDemoState(state);
    return { ok: true, mode: "demo" };
  }

  if (pathname === "/api/patient/profile" && method === "PUT") {
    const patient = state.patients[session.user.id];
    if (!patient) throw new Error("Patient not found");
    ["addressLine1", "addressLine2", "suburb", "postcode", "phone", "support"].forEach((k) => {
      if (body[k] !== undefined) patient[k] = body[k];
    });
    saveDemoState(state);
    return { ok: true, patient, mode: "demo" };
  }

  if (pathname === "/api/telehealth/start" && method === "POST") {
    const apt = state.appointments.find((a) => a.id === body.appointmentId);
    if (!apt) throw new Error("Appointment not found");
    const patient = state.patients[apt.patientId];
    apt.telehealthStatus = "in_progress";
    saveDemoState(state);
    const phoneDigits = (patient.phone || "").replace(/\D/g, "");
    return {
      ok: true,
      message: `Connecting phone consult with ${patient.name}. Your device will dial ${patient.phone}.`,
      telLink: phoneDigits ? `tel:${phoneDigits}` : null,
      mode: "demo",
    };
  }

  if (pathname === "/api/telehealth/complete" && method === "POST") {
    const apt = state.appointments.find((a) => a.id === body.appointmentId);
    if (!apt) throw new Error("Appointment not found");
    apt.telehealthStatus = "completed";
    apt.status = "completed";
    saveDemoState(state);
    return { ok: true, appointment: apt, mode: "demo" };
  }

  if (pathname.startsWith("/api/admin/change-requests/") && pathname.endsWith("/forward") && method === "POST") {
    const id = pathname.split("/")[4];
    const req = state.changeRequests.find((c) => c.id === id);
    if (!req) throw new Error("Change request not found");
    if (req.status !== "pending") throw new Error("Request already forwarded or processed.");
    const doctor = state.users[body.doctorId];
    if (!doctor || doctor.role !== "doctor") throw new Error("Doctor not found");
    req.status = "with_doctor";
    req.assignedDoctorId = doctor.id;
    req.forwardedAt = new Date().toISOString();
    req.forwardedBy = session.user.id;
    const patient = state.patients[req.patientId];
    if (patient) patient.assignedDoctorId = doctor.id;
    saveDemoState(state);
    return { ok: true, changeRequest: req, doctor, mode: "demo" };
  }

  if (pathname.startsWith("/api/doctor/change-requests/") && pathname.endsWith("/approve") && method === "POST") {
    const id = pathname.split("/")[4];
    const req = state.changeRequests.find((c) => c.id === id);
    if (!req) throw new Error("Change request not found");
    if (!["with_doctor", "pending"].includes(req.status)) throw new Error("Request already processed.");
    const rx = state.prescriptions.find((r) => r.id === req.prescriptionId);
    Object.assign(rx, {
      name: body.name || req.requestedProduct || rx.name,
      form: body.form || req.requestedForm || rx.form,
      status: "pending_dispense",
      submittedAt: new Date().toISOString(),
      prescribedBy: session.user.id,
    });
    req.status = "approved";
    req.reviewedAt = new Date().toISOString();
    saveDemoState(state);
    return { ok: true, changeRequest: req, prescription: rx, mode: "demo" };
  }

  if (pathname.startsWith("/api/doctor/change-requests/") && pathname.endsWith("/deny") && method === "POST") {
    const id = pathname.split("/")[4];
    const req = state.changeRequests.find((c) => c.id === id);
    if (!req) throw new Error("Change request not found");
    req.status = "denied";
    req.reviewedAt = new Date().toISOString();
    req.denyReason = body.reason || "";
    saveDemoState(state);
    return { ok: true, changeRequest: req, mode: "demo" };
  }

  if (pathname === "/api/doctor/appointments" && method === "POST") {
    const patient = state.patients[body.patientId];
    if (!patient) throw new Error("Patient not found");
    const doctor = state.users[body.doctorId || patient.assignedDoctorId];
    if (doctor) validateDemoSlot(state, doctor.id, body.date, body.time);
    const isNew = body.patientType === "new";
    state.appointments.push({
      id: uid("APT"),
      patientId: body.patientId,
      date: body.date,
      time: body.time,
      doctorId: doctor?.id,
      clinician: doctor?.name || "Clinician",
      patientType: isNew ? "new" : "existing",
      durationMinutes: body.durationMinutes || (isNew ? NEW_PATIENT_MINUTES : APPOINTMENT_MINUTES),
      type: body.type || (isNew ? "Initial consult" : "Follow-up consult"),
      format: "Phone consult",
      status: "confirmed",
      fee: 49,
      telehealthStatus: "scheduled",
    });
    saveDemoState(state);
    return { ok: true, mode: "demo" };
  }

  if (pathname.startsWith("/api/doctor/appointments/") && method === "PUT") {
    const id = pathname.split("/").pop();
    const apt = state.appointments.find((a) => a.id === id);
    if (!apt) throw new Error("Appointment not found");
    const doctorId = body.doctorId || apt.doctorId || state.patients[apt.patientId]?.assignedDoctorId;
    if (doctorId) validateDemoSlot(state, doctorId, body.date || apt.date, body.time || apt.time, id);
    Object.assign(apt, body);
    if (body.patientType === "new") apt.durationMinutes = NEW_PATIENT_MINUTES;
    if (body.patientType === "existing") apt.durationMinutes = APPOINTMENT_MINUTES;
    saveDemoState(state);
    return { ok: true, appointment: apt, mode: "demo" };
  }

  if (pathname === "/api/admin/appointments" && method === "POST") {
    const patient = state.patients[body.patientId];
    if (!patient) throw new Error("Patient not found");
    const doctor = state.users[body.doctorId];
    if (doctor) validateDemoSlot(state, doctor.id, body.date, body.time);
    const isNew = body.patientType === "new";
    state.appointments.push({
      id: uid("APT"),
      patientId: body.patientId,
      date: body.date,
      time: body.time,
      doctorId: doctor?.id,
      clinician: doctor?.name || "Clinician",
      patientType: isNew ? "new" : "existing",
      durationMinutes: body.durationMinutes || (isNew ? NEW_PATIENT_MINUTES : APPOINTMENT_MINUTES),
      type: body.type || (isNew ? "Initial consult" : "Follow-up consult"),
      format: "Phone consult",
      status: "confirmed",
      fee: 49,
      telehealthStatus: "scheduled",
    });
    if (doctor) patient.assignedDoctorId = doctor.id;
    saveDemoState(state);
    return { ok: true, mode: "demo" };
  }

  if (pathname === "/api/admin/overview" && session.role === "admin") {
    return {
      stats: {
        patients: Object.keys(state.patients).length,
        appointments: state.appointments.length,
        prescriptions: state.prescriptions.length,
        reorderRequests: state.prescriptions.filter((r) => r.status === "reorder_requested").length,
        pendingDispense: state.prescriptions.filter((r) => r.status === "pending_dispense").length,
        changeRequests: state.changeRequests.filter((c) => c.status === "pending").length,
        changeRequestsWithDoctor: state.changeRequests.filter((c) => c.status === "with_doctor").length,
        orders: state.orders.length,
      },
      changeRequests: state.changeRequests.filter((c) => ["pending", "with_doctor"].includes(c.status)),
      patients: Object.values(state.patients),
      appointments: state.appointments,
      prescriptions: state.prescriptions,
      orders: state.orders,
      doctors: listDoctors(state),
      telehealthLogs: [],
      mode: "demo",
    };
  }

  if (pathname === "/api/admin/patients" && method === "POST") {
    const exists = Object.values(state.patients).some(
      (p) => p.email.toLowerCase() === String(body.email || "").toLowerCase()
    );
    if (exists) throw new Error("An account with this email already exists.");
    const password = body.password || generateTempPassword();
    const doctor = resolveDoctor(state, body.assignedDoctorId);
    const patient = {
      id: uid("PT"),
      role: "patient",
      name: body.name,
      email: String(body.email).toLowerCase(),
      phone: body.phone || "",
      state: body.state || "",
      support: body.support || "",
      paid: Boolean(body.paid ?? true),
      stage: body.paid === false ? "Awaiting payment" : "Portal active",
      assignedDoctorId: doctor?.id || body.assignedDoctorId || null,
    };
    state.patients[patient.id] = patient;
    state.prescriptions.push({
      id: uid("RX"),
      patientId: patient.id,
      name: body.scriptName || "Treatment plan pending review",
      form: body.scriptForm || "As prescribed after consult",
      repeats: 0,
      repeatsTotal: 5,
      status: "pending_review",
      intervalDays: 28,
      nextReorderAt: null,
      prescribedAt: null,
      prescribedBy: doctor?.id || null,
      notes: "Awaiting clinician consult.",
    });
    saveDemoState(state);
    return { ok: true, patient, password, mode: "demo" };
  }

  if (pathname.startsWith("/api/admin/appointments/") && pathname.endsWith("/cancel") && method === "POST") {
    const id = pathname.split("/")[4];
    const apt = state.appointments.find((a) => a.id === id);
    if (!apt) throw new Error("Appointment not found");
    apt.status = "cancelled";
    apt.telehealthStatus = "cancelled";
    apt.cancelledAt = new Date().toISOString();
    apt.cancelledBy = session.user.id;
    saveDemoState(state);
    return { ok: true, appointment: apt, mode: "demo" };
  }

  if (pathname.startsWith("/api/doctor/appointments/") && pathname.endsWith("/cancel") && method === "POST") {
    const id = pathname.split("/")[4];
    const apt = state.appointments.find((a) => a.id === id);
    if (!apt) throw new Error("Appointment not found");
    apt.status = "cancelled";
    apt.telehealthStatus = "cancelled";
    apt.cancelledAt = new Date().toISOString();
    apt.cancelledBy = session.user.id;
    saveDemoState(state);
    return { ok: true, appointment: apt, mode: "demo" };
  }

  if (pathname.startsWith("/api/admin/appointments/") && method === "PUT") {
    const id = pathname.split("/").pop();
    const apt = state.appointments.find((a) => a.id === id);
    if (!apt) throw new Error("Appointment not found");
    const doctorId = body.doctorId || apt.doctorId;
    if (doctorId) validateDemoSlot(state, doctorId, body.date || apt.date, body.time || apt.time, id);
    if (body.doctorId) {
      const doctor = state.users[body.doctorId];
      if (doctor) {
        body.doctorId = doctor.id;
        body.clinician = doctor.name;
        const patient = state.patients[apt.patientId];
        if (patient) patient.assignedDoctorId = doctor.id;
      }
    }
    Object.assign(apt, body);
    saveDemoState(state);
    return { ok: true, appointment: apt, mode: "demo" };
  }

  if (pathname.startsWith("/api/admin/orders/") && method === "PUT") {
    const id = pathname.split("/").pop();
    const order = state.orders.find((o) => o.id === id);
    if (!order) throw new Error("Order not found");
    if (body.status) order.status = body.status;
    if (body.notes !== undefined) order.notes = body.notes;
    order.updatedAt = new Date().toISOString();
    saveDemoState(state);
    return { ok: true, order, mode: "demo" };
  }

  if (pathname.startsWith("/api/admin/patients/") && method === "PUT") {
    const id = pathname.split("/").pop();
    const patient = state.patients[id];
    if (!patient) throw new Error("Patient not found");
    if (body.assignedDoctorId !== undefined) {
      const doctor = body.assignedDoctorId ? state.users[body.assignedDoctorId] : null;
      patient.assignedDoctorId = doctor?.id || body.assignedDoctorId || null;
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
    Object.assign(patient, body);
    saveDemoState(state);
    return { ok: true, patient, mode: "demo" };
  }

  if (
    pathname.startsWith("/api/admin/prescriptions/") &&
    (pathname.endsWith("/dispense") || pathname.endsWith("/approve")) &&
    method === "POST"
  ) {
    const id = pathname.split("/")[4];
    const rx = state.prescriptions.find((r) => r.id === id);
    if (!rx) throw new Error("Prescription not found");
    if (!["pending_dispense", "pending_review", "reorder_requested"].includes(rx.status)) {
      throw new Error("Script is not awaiting dispense.");
    }
    const erxToken = generateErxToken();
    rx.status = "active";
    rx.dispensedAt = new Date().toISOString();
    rx.dispensedBy = session.user.id;
    rx.erxToken = erxToken;
    rx.erxScriptId = `ERX-DEMO-${Date.now().toString(36).toUpperCase()}`;
    rx.erxStatus = "sent";
    rx.erxSentAt = rx.dispensedAt;
    rx.ausscriptsUrl = `https://ausscripts.erx.com.au/scripts/${erxToken}`;
    if (!rx.prescribedAt) rx.prescribedAt = rx.dispensedAt;
    if (!rx.nextReorderAt) {
      rx.nextReorderAt = new Date(Date.now() + (rx.intervalDays || 28) * 86400000).toISOString();
    }
    saveDemoState(state);
    return {
      ok: true,
      prescription: rx,
      erx: { erxToken, erxScriptId: rx.erxScriptId, erxStatus: "sent", ausscriptsUrl: rx.ausscriptsUrl },
      mode: "demo",
    };
  }

  throw new Error(`Demo API: ${method} ${path} not implemented`);
}

export const DEMO_ACCOUNT_HINT =
  "Running in demo mode. Patients: demo@ / alex@ / sam@ / morgan@crossroads.clinic (demo1234). Doctors: dr.patel@ / dr.nguyen@ (Doctor2026). Admin: admin@crossroads.clinic (CrossroadsAdmin2026).";