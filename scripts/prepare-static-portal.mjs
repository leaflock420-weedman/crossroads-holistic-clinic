import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const portalKey = process.argv[2];

const PORTALS = {
  home: "index.html",
  book: "start.html",
  portal: "portal.html",
  doctor: "doctor.html",
  admin: "admin.html",
};

const sourceFile = PORTALS[portalKey];
if (!sourceFile) {
  console.error(`Unknown portal: ${portalKey}. Use: ${Object.keys(PORTALS).join(", ")}`);
  process.exit(1);
}

const dist = path.join(root, "dist");
const out = path.join(root, "dist-static", portalKey);

if (!existsSync(path.join(dist, sourceFile))) {
  console.error(`Run vite build first — missing dist/${sourceFile}`);
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

if (existsSync(path.join(dist, "assets"))) {
  cpSync(path.join(dist, "assets"), path.join(out, "assets"), { recursive: true });
}

writeFileSync(path.join(out, "index.html"), readFileSync(path.join(dist, sourceFile), "utf8"));

const redirects = "/*    /index.html   200\n";
writeFileSync(path.join(out, "_redirects"), redirects);

console.log(`Prepared dist-static/${portalKey} from ${sourceFile}`);