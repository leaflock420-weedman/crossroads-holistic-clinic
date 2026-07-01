const DEMO_STATE_KEY = "crossroads-demo-state-v1";

const DEMO_ACCOUNTS = {
  "demo@crossroads.clinic": { password: "demo1234", role: "patient" },
  "dr.patel@crossroads.clinic": { password: "Doctor2026", role: "doctor" },
  "admin@crossroads.clinic": { password: "CrossroadsAdmin2026", role: "admin" },
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function buildInitialState() {
  const today = todayIso();
  const followUp = new Date();
  followUp.setDate(followUp.getDate() + 14);
  const patient = {
    id: "PT-DEMO-JORDAN",
    role: "patient",
    name: "Jordan Mitchell",
    email: "demo@crossroads.clinic",
    phone: "0412 345 678",
    state: "NSW",
    support: "Sleep and evening routine support",
    stage: "Portal active",
    paid: true,
  };
  const doctor = {
    id: "DOC-DEMO-PATEL",
    role: "doctor",
    name: "Dr Patel",
    email: "dr.patel@crossroads.clinic",
    phone: "0411 222 333",
  };
  const admin = {
    id: "ADM-DEMO",
    role: "admin",
    name: "Crossroads Admin",
    email: "admin@crossroads.clinic",
    phone: "1800 000 000",
  };
  const aptToday = {
    id: "APT-DEMO-TODAY",
    patientId: patient.id,
    date: today,
    time: "14:30",
    clinician: doctor.name,
    format: "Phone consult",
    status: "confirmed",
    type: "Follow-up consult",
    fee: 49,
    telehealthStatus: "scheduled",
  };
  const aptFollow = {
    id: "APT-DEMO-FOLLOW",
    patientId: patient.id,
    date: followUp.toISOString().slice(0, 10),
    time: "10:00",
    clinician: doctor.name,
    format: "Phone consult",
    status: "confirmed",
    type: "Interval check-in",
    fee: 49,
    telehealthStatus: "scheduled",
  };
  const rxActive = {
    id: "RX-DEMO-ACTIVE",
    patientId: patient.id,
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
  };
  const rxReorder = {
    id: "RX-DEMO-REORDER",
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
  };
  return {
    users: { [doctor.id]: doctor, [admin.id]: admin },
    patients: { [patient.id]: patient },
    appointments: [aptToday, aptFollow],
    prescriptions: [rxActive, rxReorder],
    orders: [
      {
        id: "ORD-DEMO-1",
        patientId: patient.id,
        items: [
          { id: "vaporiser-mini", name: "Portable dry herb vaporiser", price: 89, qty: 1 },
          { id: "storage-jar", name: "UV storage jar", price: 18, qty: 2 },
        ],
        total: 125,
        status: "processing",
        createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      },
    ],
    sessions: {},
  };
}

function loadDemoState() {
  try {
    const raw = sessionStorage.getItem(DEMO_STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const state = buildInitialState();
  saveDemoState(state);
  return state;
}

function saveDemoState(state) {
  sessionStorage.setItem(DEMO_STATE_KEY, JSON.stringify(state));
}

function patientName(state, id) {
  return state.patients[id]?.name || id;
}

function getSession(state, token) {
  const session = state.sessions[token];
  if (!session) return null;
  const user =
    state.patients[session.userId] || state.users[session.userId];
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
  };
}

export function resetDemoState() {
  sessionStorage.removeItem(DEMO_STATE_KEY);
  loadDemoState();
}

export function demoApi(path, options = {}, token) {
  const state = loadDemoState();
  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};

  if (path === "/api/health") {
    return { ok: true, service: "crossroads-clinic", mode: "demo" };
  }

  if (path === "/api/auth/login" && method === "POST") {
    const email = String(body.email || "").toLowerCase();
    const account = DEMO_ACCOUNTS[email];
    if (!account || account.password !== body.password) {
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
  if (!session && path !== "/api/config") {
    throw new Error("Unauthorized");
  }

  if (path === "/api/auth/me") {
    return { user: session.user, role: session.role, mode: "demo" };
  }

  if (path === "/api/config") {
    return { consultFee: 49, mode: "demo" };
  }

  if (path === "/api/patient/dashboard" && session.role === "patient") {
    const data = patientBundle(state, session.user.id);
    if (!data) throw new Error("Patient not found");
    return { ...data, mode: "demo" };
  }

  if (path.startsWith("/api/patient/reorder/") && method === "POST") {
    const id = path.split("/").pop();
    const rx = state.prescriptions.find((r) => r.id === id);
    if (!rx) throw new Error("Prescription not found");
    rx.status = "reorder_requested";
    rx.repeats = Math.max(0, rx.repeats - 1);
    saveDemoState(state);
    return { ok: true, prescription: rx, mode: "demo" };
  }

  if (path === "/api/patient/orders" && method === "POST") {
    const order = {
      id: `ORD-DEMO-${Date.now()}`,
      patientId: session.user.id,
      items: body.items || [],
      total: (body.items || []).reduce((s, i) => s + i.price * i.qty, 0),
      status: "processing",
      createdAt: new Date().toISOString(),
    };
    state.orders.push(order);
    saveDemoState(state);
    return { ok: true, order, mode: "demo" };
  }

  if (path === "/api/doctor/queue" && (session.role === "doctor" || session.role === "admin")) {
    const queue = state.appointments
      .filter((a) => a.status === "confirmed" || a.telehealthStatus === "in_progress" || a.telehealthStatus === "completed")
      .map((apt) => ({
        appointment: apt,
        patient: state.patients[apt.patientId],
        prescriptions: state.prescriptions.filter((r) => r.patientId === apt.patientId),
      }));
    return { queue, mode: "demo" };
  }

  if (path.startsWith("/api/doctor/patients/")) {
    const id = path.split("/").pop();
    const data = patientBundle(state, id);
    if (!data) throw new Error("Patient not found");
    return { ...data, mode: "demo" };
  }

  if (path.startsWith("/api/prescriptions/") && method === "PUT") {
    const id = path.split("/").pop();
    const rx = state.prescriptions.find((r) => r.id === id);
    if (!rx) throw new Error("Prescription not found");
    Object.assign(rx, body);
    if (body.status === "active" && !rx.prescribedAt) {
      rx.prescribedAt = new Date().toISOString();
    }
    saveDemoState(state);
    return { ok: true, prescription: rx, mode: "demo" };
  }

  if (path === "/api/prescriptions" && method === "POST") {
    const rx = {
      id: `RX-DEMO-${Date.now()}`,
      patientId: body.patientId,
      name: body.name,
      form: body.form || "",
      repeats: Number(body.repeats ?? 5),
      repeatsTotal: Number(body.repeatsTotal ?? 5),
      status: body.status || "active",
      intervalDays: Number(body.intervalDays ?? 28),
      nextReorderAt: new Date(Date.now() + Number(body.intervalDays ?? 28) * 86400000).toISOString(),
      prescribedAt: new Date().toISOString(),
      prescribedBy: session.user.id,
      notes: body.notes || "",
    };
    state.prescriptions.push(rx);
    saveDemoState(state);
    return { ok: true, prescription: rx, mode: "demo" };
  }

  if (path === "/api/telehealth/start" && method === "POST") {
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

  if (path === "/api/telehealth/complete" && method === "POST") {
    const apt = state.appointments.find((a) => a.id === body.appointmentId);
    if (!apt) throw new Error("Appointment not found");
    apt.telehealthStatus = "completed";
    apt.status = "completed";
    saveDemoState(state);
    return { ok: true, appointment: apt, mode: "demo" };
  }

  if (path === "/api/admin/overview" && session.role === "admin") {
    return {
      stats: {
        patients: Object.keys(state.patients).length,
        appointments: state.appointments.length,
        prescriptions: state.prescriptions.length,
        reorderRequests: state.prescriptions.filter((r) => r.status === "reorder_requested").length,
        orders: state.orders.length,
      },
      patients: Object.values(state.patients),
      appointments: state.appointments,
      prescriptions: state.prescriptions,
      orders: state.orders,
      doctors: Object.values(state.users).filter((u) => u.role === "doctor"),
      telehealthLogs: [],
      mode: "demo",
    };
  }

  throw new Error(`Demo API: ${method} ${path} not implemented`);
}

export const DEMO_ACCOUNT_HINT =
  "Running in demo mode (API offline). Use demo@crossroads.clinic / demo1234, dr.patel@crossroads.clinic / Doctor2026, or admin@crossroads.clinic / CrossroadsAdmin2026.";