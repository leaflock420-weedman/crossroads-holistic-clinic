import { demoApi, DEMO_ACCOUNT_HINT, isKnownDemoEmail } from "./demo-api.js";

const API_HOST = import.meta.env.VITE_API_HOST || "";
const API_BASE = API_HOST ? (API_HOST.startsWith("http") ? API_HOST : `https://${API_HOST}`) : "";

const API_MODE_KEY = "crossroads-api-mode";
let TOKEN_KEY = "crossroads-auth-token";
let apiMode = null;

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === API_MODE_KEY && (e.newValue === "live" || e.newValue === "demo")) {
      apiMode = e.newValue;
    }
  });
}

export function configureAuth(portal) {
  TOKEN_KEY = `crossroads-auth-${portal}`;
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function clearOtherPortalTokens(portal) {
  ["patient", "doctor", "admin"].forEach((key) => {
    if (key !== portal) sessionStorage.removeItem(`crossroads-auth-${key}`);
  });
}

export function isDemoMode() {
  return apiMode === "demo";
}

export function forceDemoMode() {
  apiMode = "demo";
  try {
    localStorage.setItem(API_MODE_KEY, "demo");
  } catch {}
}

export async function resolveApiMode() {
  return detectApiMode();
}

function apiUrl(path) {
  if (path.startsWith("http")) return path;
  return `${API_BASE}${path}`;
}

async function detectApiMode() {
  try {
    const res = await fetch(apiUrl("/api/health"), { headers: { Accept: "application/json" } });
    const text = await res.text();
    const trimmed = text.trim();
    if (trimmed.startsWith("{")) {
      const data = JSON.parse(trimmed);
      if (data?.ok && data?.service === "crossroads-clinic" && data?.mode !== "demo") {
        apiMode = "live";
        try {
          localStorage.setItem(API_MODE_KEY, "live");
        } catch {}
        return apiMode;
      }
    }
  } catch {}
  apiMode = "demo";
  try {
    localStorage.setItem(API_MODE_KEY, "demo");
  } catch {}
  return apiMode;
}

function loginBodyEmail(options) {
  if (!options.body) return "";
  try {
    return String(JSON.parse(options.body).email || "").toLowerCase().trim();
  } catch {
    return "";
  }
}

async function fetchLive(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(apiUrl(path), { ...options, headers });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    return { res, data: null, parseError: true };
  }
  return { res, data, parseError: false };
}

export async function api(path, options = {}) {
  let mode = await detectApiMode();

  if (mode === "demo") {
    try {
      return demoApi(path, options, getToken());
    } catch (err) {
      throw new Error(err.message || "Demo request failed");
    }
  }

  let { res, data, parseError } = await fetchLive(path, options);

  if (parseError) {
    apiMode = "demo";
    if (path.includes("/auth/login") && isKnownDemoEmail(loginBodyEmail(options))) {
      return demoApi(path, options, getToken());
    }
    if (path.includes("/auth/login")) {
      throw new Error(`Login unavailable on server. ${DEMO_ACCOUNT_HINT}`);
    }
    throw new Error("Server returned an invalid response. Try demo credentials or refresh in a minute.");
  }

  if (!res.ok && path.includes("/auth/login") && isKnownDemoEmail(loginBodyEmail(options))) {
    apiMode = "demo";
    return demoApi(path, options, getToken());
  }

  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
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