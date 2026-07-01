/** One static deploy: all portal HTML + assets on crossroads.clinic */
import { cpSync, mkdirSync, existsSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");
const out = path.join(root, "dist-static", "home");

const PAGES = ["index.html", "start.html", "portal.html", "doctor.html", "admin.html"];

if (!existsSync(dist)) {
  console.error("Run vite build first — missing dist/");
  process.exit(1);
}

for (const file of PAGES) {
  if (!existsSync(path.join(dist, file))) {
    console.error(`Missing dist/${file}`);
    process.exit(1);
  }
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(dist, out, { recursive: true });

const redirects = [
  "/start      /start.html     200",
  "/start/     /start.html     200",
  "/portal     /portal.html    200",
  "/portal/    /portal.html    200",
  "/doctor     /doctor.html    200",
  "/doctor/    /doctor.html    200",
  "/admin      /admin.html     200",
  "/admin/     /admin.html     200",
].join("\n");

writeFileSync(path.join(out, "_redirects"), `${redirects}\n`);
console.log("Prepared dist-static/home — all portals on one domain");