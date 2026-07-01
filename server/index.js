require("dotenv").config();
const express = require("express");
const path = require("path");
const store = require("./store");
const domains = require("./domains");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DIST = path.join(__dirname, "..", "dist");
const API_ONLY = process.env.API_ONLY === "1" || process.env.API_ONLY === "true";

function allowedOrigin(origin) {
  if (!origin) return false;
  if (origin.endsWith(".onrender.com") || origin.endsWith(".crossroads.clinic")) return true;
  if (origin === `https://${domains.CLINIC_DOMAIN}` || origin === `http://${domains.CLINIC_DOMAIN}`) return true;
  const extra = (process.env.CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return extra.includes(origin);
}

app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
  }
  next();
});

function auth(requiredRoles) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    const session = store.getSession(token);
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    if (requiredRoles && !requiredRoles.includes(session.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    req.session = session;
    next();
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "crossroads-clinic", mode: "live" });
});

app.get("/api/sites", (req, res) => {
  res.json(domains.getSitesConfig(req));
});

app.get("/api/config", (_req, res) => {
  res.json({
    consultFee: store.CONSULT_FEE,
    appointmentMinutes: store.APPOINTMENT_MINUTES,
    newPatientMinutes: store.NEW_PATIENT_MINUTES,
  });
});

app.get("/api/doctors", (_req, res) => {
  res.json({ doctors: store.listDoctors() });
});

app.get("/api/booking/slots", (req, res) => {
  const { doctorId, date } = req.query;
  if (!doctorId || !date) return res.status(400).json({ error: "doctorId and date required" });
  const result = store.getBookingSlots(doctorId, date);
  if (!result.ok) return res.status(404).json(result);
  res.json(result);
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const result = store.login(email, password);
  if (!result.ok) return res.status(401).json(result);
  res.json(result);
});

app.post("/api/auth/logout", auth(), (req, res) => {
  store.clearToken(req.session.token);
  res.json({ ok: true });
});

app.get("/api/auth/me", auth(), (req, res) => {
  res.json({ user: req.session.user, role: req.session.role });
});

app.post("/api/patients/register", (req, res) => {
  const result = store.registerPatient(req.body || {});
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.get("/api/patient/dashboard", auth(["patient"]), (req, res) => {
  const data = store.getPatientBundle(req.session.user.id);
  if (!data) return res.status(404).json({ error: "Patient not found" });
  res.json(data);
});

app.post("/api/patient/reorder/:id", auth(["patient"]), (req, res) => {
  const result = store.requestReorder(req.params.id);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.post("/api/patient/prescriptions/:id/change-request", auth(["patient"]), (req, res) => {
  const result = store.requestMedicationChange(req.session.user.id, req.params.id, req.body || {});
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.post("/api/patient/medication-requests", auth(["patient"]), (req, res) => {
  const result = store.requestPatientMedication(req.session.user.id, req.body || {});
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.post("/api/patient/orders", auth(["patient"]), (req, res) => {
  const result = store.placeOrder(req.session.user.id, req.body.items || [], {
    delivery: req.body.delivery,
  });
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.get("/api/doctor/queue", auth(["doctor", "admin"]), (req, res) => {
  res.json({ queue: store.doctorQueue(req.session.user.id) });
});

app.get("/api/doctor/patients/:id", auth(["doctor", "admin"]), (req, res) => {
  const data = store.getPatientBundle(req.params.id);
  if (!data) return res.status(404).json({ error: "Patient not found" });
  res.json(data);
});

app.put("/api/prescriptions/:id", auth(["doctor", "admin"]), (req, res) => {
  const result = store.updatePrescription(req.params.id, req.body || {}, req.session.user.id);
  if (!result.ok) return res.status(404).json(result);
  res.json(result);
});

app.post("/api/prescriptions", auth(["doctor", "admin"]), (req, res) => {
  const { patientId, ...data } = req.body || {};
  if (!patientId) return res.status(400).json({ error: "patientId required" });
  const result = store.createPrescription(patientId, data, req.session.user.id);
  res.json(result);
});

app.post("/api/doctor/change-requests/:id/approve", auth(["doctor"]), (req, res) => {
  const result = store.approveChangeRequest(req.params.id, req.session.user.id, req.body || {});
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.post("/api/doctor/change-requests/:id/deny", auth(["doctor"]), (req, res) => {
  const result = store.denyChangeRequest(req.params.id, req.session.user.id, req.body?.reason);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.post("/api/admin/change-requests/:id/forward", auth(["admin"]), (req, res) => {
  const { doctorId } = req.body || {};
  if (!doctorId) return res.status(400).json({ error: "doctorId required" });
  const result = store.forwardChangeRequest(req.params.id, doctorId, req.session.user.id);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.post("/api/doctor/appointments", auth(["doctor"]), (req, res) => {
  const result = store.createAppointment({
    ...req.body,
    scheduledBy: req.session.user.id,
  });
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.put("/api/doctor/appointments/:id", auth(["doctor"]), (req, res) => {
  const result = store.updateAppointment(req.params.id, {
    ...req.body,
    scheduledBy: req.session.user.id,
    source: "doctor",
  });
  if (!result.ok) return res.status(404).json(result);
  res.json(result);
});

app.post("/api/telehealth/start", auth(["doctor", "admin"]), (req, res) => {
  const result = store.startTelehealth(req.body.appointmentId, req.session.user.id);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.post("/api/telehealth/complete", auth(["doctor", "admin"]), (req, res) => {
  const result = store.completeTelehealth(req.body.appointmentId);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.get("/api/admin/overview", auth(["admin"]), (req, res) => {
  res.json(store.adminOverview());
});

app.post("/api/admin/patients", auth(["admin"]), (req, res) => {
  const result = store.adminCreatePatient(req.body || {});
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

function approveScript(req, res) {
  const result = store.approvePrescription(req.params.id, req.session.user.id);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
}

app.post("/api/admin/prescriptions/:id/approve", auth(["admin"]), approveScript);
app.post("/api/admin/prescriptions/:id/dispense", auth(["admin"]), approveScript);

app.put("/api/patient/profile", auth(["patient"]), (req, res) => {
  const result = store.updatePatientProfile(req.session.user.id, req.body || {});
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.post("/api/patient/appointments", auth(["patient"]), (req, res) => {
  const bundle = store.getPatientBundle(req.session.user.id);
  const result = store.createAppointment({
    patientId: req.session.user.id,
    doctorId: bundle?.patient?.assignedDoctorId,
    date: req.body.date,
    time: req.body.time,
    patientType: req.body.patientType || "existing",
    type: req.body.type || "Follow-up consult",
    durationMinutes: req.body.patientType === "new" ? 30 : 15,
    format: "Phone consult",
  });
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.post("/api/admin/appointments", auth(["admin"]), (req, res) => {
  const result = store.createAppointment({
    ...req.body,
    scheduledBy: req.session.user.id,
  });
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.get("/api/doctor/availability", auth(["doctor", "admin"]), (req, res) => {
  const doctorId = req.session.role === "doctor" ? req.session.user.id : req.query.doctorId;
  const { date } = req.query;
  if (!doctorId || !date) return res.status(400).json({ error: "doctorId and date required" });
  res.json({ slots: store.getDoctorAvailability(doctorId, date) });
});

app.put("/api/doctor/availability", auth(["doctor"]), (req, res) => {
  const { date, times } = req.body || {};
  if (!date) return res.status(400).json({ error: "date required" });
  const result = store.setDoctorAvailability(req.session.user.id, date, times || []);
  res.json(result);
});

app.get("/api/admin/patients/:id/detail", auth(["admin"]), (req, res) => {
  const data = store.getAdminPatientDetail(req.params.id);
  if (!data) return res.status(404).json({ error: "Patient not found." });
  res.json(data);
});

app.put("/api/admin/patients/:id", auth(["admin"]), (req, res) => {
  const result = store.updatePatient(req.params.id, req.body || {});
  if (!result.ok) return res.status(404).json(result);
  res.json(result);
});

app.post("/api/admin/prescriptions", auth(["admin"]), (req, res) => {
  const { patientId, ...data } = req.body || {};
  if (!patientId) return res.status(400).json({ error: "patientId required" });
  const result = store.adminAddPrescription(patientId, data, req.session.user.id);
  res.json(result);
});

app.put("/api/admin/appointments/:id", auth(["admin"]), (req, res) => {
  const result = store.updateAppointment(req.params.id, req.body || {});
  if (!result.ok) return res.status(404).json(result);
  res.json(result);
});

app.post("/api/admin/appointments/:id/cancel", auth(["admin"]), (req, res) => {
  const result = store.cancelAppointment(req.params.id, req.session.user.id);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.post("/api/doctor/appointments/:id/cancel", auth(["doctor"]), (req, res) => {
  const result = store.cancelAppointment(req.params.id, req.session.user.id);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.put("/api/admin/orders/:id", auth(["admin"]), (req, res) => {
  const result = store.updateOrder(req.params.id, req.body || {});
  if (!result.ok) return res.status(404).json(result);
  res.json(result);
});

function sendDist(file, res) {
  res.sendFile(path.join(DIST, file));
}

if (API_ONLY) {
  app.get("/", (_req, res) => {
    res.json({ ok: true, service: "crossroads-clinic", mode: "api-only", health: "/api/health" });
  });
} else {
  app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();

  const ctx = domains.resolveRequest(req);
  req.siteContext = ctx;

  if (ctx.mode !== "subdomains") return next();

  if (ctx.portal === "api") {
    if (!req.path.startsWith("/api/")) {
      return res.redirect(302, "/api/health");
    }
    return next();
  }

  const pathPortal = domains.pathToPortal(req.path);
  if (pathPortal && pathPortal !== ctx.portal && ctx.portal) {
    return res.redirect(302, domains.siteUrl(pathPortal, req));
  }

  if (ctx.portal === "home" && pathPortal && pathPortal !== "home") {
    return res.redirect(301, domains.siteUrl(pathPortal, req));
  }

  if (ctx.portal && ctx.portal !== "home") {
    const file = domains.portalFile(ctx.portal);
    if (!file) return next();

    const legacyPaths = new Set([`/${file}`, domains.PORTALS[ctx.portal]?.path].filter(Boolean));
    if (legacyPaths.has(req.path)) {
      return res.redirect(301, "/");
    }

    if (req.path === "/" || req.path === "") {
      return sendDist(file, res);
    }
  }

  return next();
});

const cleanRoutes = {
  "/start": "start.html",
  "/portal": "portal.html",
  "/doctor": "doctor.html",
  "/admin": "admin.html",
};
Object.entries(cleanRoutes).forEach(([route, file]) => {
  const send = (req, res) => {
    const ctx = domains.resolveRequest(req);
    const portalKey = domains.pathToPortal(route);
    if (ctx.mode === "subdomains" && portalKey) {
      return res.redirect(301, domains.siteUrl(portalKey, req));
    }
    sendDist(file, res);
  };
  app.get(route, send);
  app.get(`${route}/`, send);
});

app.get("/", (req, res) => {
  const ctx = req.siteContext || domains.resolveRequest(req);
  if (ctx.mode === "subdomains" && ctx.portal && ctx.portal !== "home") {
    const file = domains.portalFile(ctx.portal);
    if (file) return sendDist(file, res);
  }
  sendDist("index.html", res);
});

app.use(express.static(DIST, { index: false }));

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found" });
  }
  const ctx = domains.resolveRequest(req);
  if (ctx.mode === "subdomains" && ctx.portal && ctx.portal !== "home" && ctx.portal !== "api") {
    const file = domains.portalFile(ctx.portal);
    if (file) return sendDist(file, res);
  }
  sendDist("index.html", res);
});
}

app.listen(PORT, () => {
  const label = API_ONLY ? "API-only" : "full stack";
  console.log(`Crossroads clinic ${label} live → http://localhost:${PORT}/api/health`);
});