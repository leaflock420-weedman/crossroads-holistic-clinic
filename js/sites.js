const API_HOST = import.meta.env.VITE_API_HOST || "";
const API_BASE = API_HOST ? (API_HOST.startsWith("http") ? API_HOST : `https://${API_HOST}`) : "";

let sitesCache = null;

const PATH_URLS = {
  home: "/",
  book: "/start.html",
  portal: "/portal.html",
  doctor: "/doctor.html",
  admin: "/admin.html",
};

const FALLBACK = {
  mode: "paths",
  domain: "crossroads.clinic",
  current: "home",
  urls: { ...PATH_URLS },
};

function onClinicDomain() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "crossroads.clinic" || h === "www.crossroads.clinic";
}

function normalizeSites(data) {
  const merged = { ...FALLBACK, ...data, urls: { ...FALLBACK.urls, ...data?.urls } };
  if (onClinicDomain() && merged.mode !== "paths") {
    merged.mode = "paths";
    merged.urls = {
      home: "/",
      book: "/start.html",
      portal: "/portal.html",
      doctor: "/doctor.html",
      admin: "/admin.html",
      api: merged.urls.api || "https://api.crossroads.clinic",
    };
  }
  return merged;
}

export async function getSites() {
  if (sitesCache) return sitesCache;
  try {
    const res = await fetch(`${API_BASE}/api/sites`, { headers: { Accept: "application/json" } });
    const text = await res.text();
    if (text.trim().startsWith("{")) {
      sitesCache = normalizeSites(JSON.parse(text));
      return sitesCache;
    }
  } catch {}
  sitesCache = { ...FALLBACK };
  return sitesCache;
}

export function siteHref(sites, key) {
  return sites?.urls?.[key] || FALLBACK.urls[key] || "/";
}

export async function initSiteLinks(root = document) {
  const sites = await getSites();
  root.querySelectorAll("[data-site]").forEach((el) => {
    const key = el.dataset.site;
    const href = siteHref(sites, key);
    if (!href) return;
    if (el instanceof HTMLAnchorElement) el.href = href;
    else el.setAttribute("href", href);
  });
}