import { demoApi, DEMO_ACCOUNT_HINT } from "./demo-api.js";

let TOKEN_KEY = "crossroads-auth-token";
let apiMode = null;

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

async function detectApiMode() {
  if (apiMode) return apiMode;
  try {
    const res = await fetch("/api/health", { headers: { Accept: "application/json" } });
    const text = await res.text();
    const data = JSON.parse(text);
    if (data?.ok && data?.service === "crossroads-clinic") {
      apiMode = "live";
      return apiMode;
    }
  } catch {}
  apiMode = "demo";
  return apiMode;
}

export async function api(path, options = {}) {
  const mode = await detectApiMode();

  if (mode === "demo") {
    try {
      return demoApi(path, options, getToken());
    } catch (err) {
      throw new Error(err.message || "Demo request failed");
    }
  }

  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    apiMode = "demo";
    if (path.includes("/auth/login")) {
      throw new Error(`Login unavailable on server. ${DEMO_ACCOUNT_HINT}`);
    }
    throw new Error("Server returned an invalid response. Try demo credentials or refresh in a minute.");
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