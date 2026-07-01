const CLINIC_DOMAIN = (process.env.CLINIC_DOMAIN || "crossroads.clinic").toLowerCase();

const PORTALS = {
  home: { key: "home", subdomain: null, file: "index.html", path: "/" },
  book: { key: "book", subdomain: "book", file: "start.html", path: "/start" },
  portal: { key: "portal", subdomain: "portal", file: "portal.html", path: "/portal" },
  doctor: { key: "doctor", subdomain: "doctor", file: "doctor.html", path: "/doctor" },
  admin: { key: "admin", subdomain: "admin", file: "admin.html", path: "/admin" },
  api: { key: "api", subdomain: "api", file: null, path: "/api" },
};

const PATH_ALIASES = {
  "/": "home",
  "/start": "book",
  "/start.html": "book",
  "/portal": "portal",
  "/portal.html": "portal",
  "/doctor": "doctor",
  "/doctor.html": "doctor",
  "/admin": "admin",
  "/admin.html": "admin",
};

function hostName(req) {
  return String(req.headers.host || req.hostname || "")
    .split(":")[0]
    .toLowerCase();
}

function isPathModeHost(host) {
  if (!host || host === "localhost" || host === "127.0.0.1") return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (host.endsWith(".onrender.com")) return true;
  if (!host.endsWith(CLINIC_DOMAIN) && host !== CLINIC_DOMAIN) return true;
  return false;
}

function portalFromHost(host) {
  if (host === CLINIC_DOMAIN || host === `www.${CLINIC_DOMAIN}`) return "home";
  if (!host.endsWith(`.${CLINIC_DOMAIN}`)) return null;
  const sub = host.slice(0, -(CLINIC_DOMAIN.length + 1));
  const match = Object.values(PORTALS).find((p) => p.subdomain === sub);
  return match?.key || null;
}

function resolveRequest(req) {
  const host = hostName(req);
  if (isPathModeHost(host)) {
    return { mode: "paths", host, portal: pathToPortal(req.path) };
  }
  return { mode: "subdomains", host, portal: portalFromHost(host) };
}

function pathToPortal(pathname) {
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  if (path === "/") return null;
  return PATH_ALIASES[path] || null;
}

function requestProtocol(req) {
  const forwarded = req.headers["x-forwarded-proto"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.protocol || "https";
}

function siteUrl(portalKey, req, { path = "/" } = {}) {
  const portal = PORTALS[portalKey];
  if (!portal) return "/";

  const host = hostName(req);
  const useSubdomains = !isPathModeHost(host);

  if (!useSubdomains) {
    if (portalKey === "home") return path === "/" ? "/" : path;
    const base = portal.path;
    return path && path !== "/" ? `${base}${path}` : `${base}.html`;
  }

  const protocol = requestProtocol(req);
  if (portalKey === "home") {
    const suffix = path && path !== "/" ? path : "";
    return `${protocol}://${CLINIC_DOMAIN}${suffix}`;
  }
  const suffix = path && path !== "/" ? path : "";
  return `${protocol}://${portal.subdomain}.${CLINIC_DOMAIN}${suffix}`;
}

function buildUrls(req) {
  const host = hostName(req);
  const useSubdomains = !isPathModeHost(host);
  const protocol = requestProtocol(req);

  if (!useSubdomains) {
    return {
      home: "/",
      book: "/start.html",
      portal: "/portal.html",
      doctor: "/doctor.html",
      admin: "/admin.html",
    };
  }

  return {
    home: `${protocol}://${CLINIC_DOMAIN}`,
    book: `${protocol}://book.${CLINIC_DOMAIN}`,
    portal: `${protocol}://portal.${CLINIC_DOMAIN}`,
    doctor: `${protocol}://doctor.${CLINIC_DOMAIN}`,
    admin: `${protocol}://admin.${CLINIC_DOMAIN}`,
    api: `${protocol}://api.${CLINIC_DOMAIN}`,
  };
}

function getSitesConfig(req) {
  const ctx = resolveRequest(req);
  return {
    mode: ctx.mode,
    domain: CLINIC_DOMAIN,
    current: ctx.portal || "home",
    urls: buildUrls(req),
  };
}

function portalFile(portalKey) {
  return PORTALS[portalKey]?.file || null;
}

module.exports = {
  CLINIC_DOMAIN,
  PORTALS,
  resolveRequest,
  pathToPortal,
  siteUrl,
  getSitesConfig,
  portalFile,
  isPathModeHost,
};