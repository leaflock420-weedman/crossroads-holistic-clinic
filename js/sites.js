let sitesCache = null;

const FALLBACK = {
  mode: "paths",
  domain: "crossroads.clinic",
  current: "home",
  urls: {
    home: "/",
    book: "/start.html",
    portal: "/portal.html",
    doctor: "/doctor.html",
    admin: "/admin.html",
  },
};

export async function getSites() {
  if (sitesCache) return sitesCache;
  try {
    const res = await fetch("/api/sites", { headers: { Accept: "application/json" } });
    const text = await res.text();
    if (text.trim().startsWith("{")) {
      sitesCache = { ...FALLBACK, ...JSON.parse(text) };
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