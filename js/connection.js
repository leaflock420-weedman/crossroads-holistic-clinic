import { resolveApiMode, isDemoMode } from "./api.js";
import { getSites } from "./sites.js";

function bannerCopy(live, subdomainMode, sites) {
  if (live && (subdomainMode || sites?.mode === "split")) {
    return `<span class="connection-banner__dot"></span><strong>Live · ${window.location.hostname}</strong> — this portal runs separately and shares the clinic API with the other portals.`;
  }
  if (live) {
    return `<span class="connection-banner__dot"></span><strong>Live server</strong> — doctor, admin, and patient portals share one database. Updates sync automatically.`;
  }
  if (subdomainMode) {
    return `<span class="connection-banner__dot"></span><strong>Demo on subdomain</strong> — live data syncs across portals on crossroads.clinic. For shared demo testing, use the main Render URL.`;
  }
  return `<span class="connection-banner__dot"></span><strong>Shared demo mode</strong> — all open tabs use the same saved data. Doctor submissions appear in admin within seconds.`;
}

export async function mountConnectionBanner(host) {
  if (!host) return;
  const [mode, sites] = await Promise.all([resolveApiMode(), getSites()]);
  let banner = host.querySelector("[data-connection-banner]");
  if (!banner) {
    banner = document.createElement("div");
    banner.dataset.connectionBanner = "";
    banner.className = "connection-banner";
    host.prepend(banner);
  }
  const live = mode === "live";
  const subdomainMode = sites.mode === "subdomains";
  banner.classList.toggle("connection-banner--live", live);
  banner.classList.toggle("connection-banner--demo", !live);
  banner.innerHTML = bannerCopy(live, subdomainMode, sites);
  return mode;
}

export async function refreshConnectionBanner(host) {
  if (!host) return;
  const banner = host.querySelector("[data-connection-banner]");
  if (!banner) return mountConnectionBanner(host);
  const live = !isDemoMode();
  const sites = await getSites();
  const subdomainMode = sites.mode === "subdomains";
  banner.classList.toggle("connection-banner--live", live);
  banner.classList.toggle("connection-banner--demo", !live);
  banner.innerHTML = bannerCopy(live, subdomainMode, sites);
}