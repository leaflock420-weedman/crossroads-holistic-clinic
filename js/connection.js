import { resolveApiMode, isDemoMode } from "./api.js";

export async function mountConnectionBanner(host) {
  if (!host) return;
  const mode = await resolveApiMode();
  let banner = host.querySelector("[data-connection-banner]");
  if (!banner) {
    banner = document.createElement("div");
    banner.dataset.connectionBanner = "";
    banner.className = "connection-banner";
    host.prepend(banner);
  }
  const live = mode === "live";
  banner.classList.toggle("connection-banner--live", live);
  banner.classList.toggle("connection-banner--demo", !live);
  banner.innerHTML = live
    ? `<span class="connection-banner__dot"></span><strong>Live server</strong> — doctor, admin, and patient portals share one database. Updates sync automatically.`
    : `<span class="connection-banner__dot"></span><strong>Shared demo mode</strong> — all open tabs use the same saved data. Doctor submissions appear in admin within seconds.`;
  return mode;
}

export function refreshConnectionBanner(host) {
  if (!host) return;
  const banner = host.querySelector("[data-connection-banner]");
  if (!banner) return mountConnectionBanner(host);
  const live = !isDemoMode();
  banner.classList.toggle("connection-banner--live", live);
  banner.classList.toggle("connection-banner--demo", !live);
  banner.innerHTML = live
    ? `<span class="connection-banner__dot"></span><strong>Live server</strong> — doctor, admin, and patient portals share one database. Updates sync automatically.`
    : `<span class="connection-banner__dot"></span><strong>Shared demo mode</strong> — all open tabs use the same saved data. Doctor submissions appear in admin within seconds.`;
}