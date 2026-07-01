let TOKEN_KEY = "crossroads-auth-token";

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

export async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
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