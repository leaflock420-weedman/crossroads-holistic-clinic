/**
 * Deploy Crossroads HC blueprint on a NEW Render account.
 * 1. Sign OUT of old Render account in Chrome
 * 2. Sign IN to your other Render account
 * 3. Run: node scripts/render-migrate.mjs
 */
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { existsSync, mkdirSync, writeFileSync } from "fs";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PLAYWRIGHT_ROOTS = [
  "C:\\Users\\wordo\\leaflock-hydro-crm",
  "C:\\Users\\wordo\\leaflock-pharmacy-crm",
];
const playwrightRoot = PLAYWRIGHT_ROOTS.find((p) => existsSync(path.join(p, "node_modules", "playwright")));
if (!playwrightRoot) throw new Error("Playwright not found");
const { chromium } = require(require.resolve("playwright", { paths: [playwrightRoot] }));

const GITHUB_REPO = "https://github.com/leaflock420-weedman/crossroads-holistic-clinic";
const BLUEPRINT_NAME = "crossroads-hc";
const PROFILE = path.join(root, ".chrome-deploy-profile");

const SERVICE_NAMES = [
  "crossroads-api",
  "crossroads-home",
  "crossroads-book",
  "crossroads-portal",
  "crossroads-doctor",
  "crossroads-admin",
];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(root, name), fullPage: true });
  console.log(`Screenshot: ${name}`);
}

async function connectCdp() {
  for (const port of [9225, 9224, 9223]) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch {}
  }
  return null;
}

async function launchChrome(url) {
  const { spawn } = await import("child_process");
  mkdirSync(PROFILE, { recursive: true });
  spawn(
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    ["--remote-debugging-port=9225", `--user-data-dir=${PROFILE}`, "--no-first-run", url],
    { detached: true, stdio: "ignore" }
  ).unref();
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const b = await connectCdp();
    if (b) return b;
  }
  return null;
}

async function waitForLogin(page) {
  const start = Date.now();
  while (Date.now() - start < 300000) {
    const text = await page.locator("body").innerText().catch(() => "");
    if (!/sign in to render/i.test(text) && /dashboard|services|projects/i.test(text)) {
      console.log("Render dashboard ready");
      return true;
    }
    if (!/sign in to render/i.test(text) && text.includes("Deploy Blueprint")) {
      return true;
    }
    await sleep(3000);
  }
  return false;
}

async function clickFirst(page, makers, timeout = 8000) {
  for (const make of makers) {
    try {
      const el = make(page).first();
      if (await el.isVisible({ timeout })) {
        await el.click();
        return true;
      }
    } catch {}
  }
  return false;
}

async function deployBlueprint(page) {
  const url = `https://render.com/deploy?repo=${encodeURIComponent(GITHUB_REPO)}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(4000);
  await screenshot(page, "migrate-1-blueprint.png");

  const nameInput = page.getByLabel(/blueprint name/i).first();
  if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await nameInput.fill(BLUEPRINT_NAME);
  }

  const pathInput = page.getByLabel(/blueprint path/i).first();
  if (await pathInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await pathInput.clear().catch(() => {});
    await pathInput.fill("render.yaml");
  }

  console.log("Waiting for blueprint planning to finish...");
  for (let i = 0; i < 40; i++) {
    const text = await page.locator("body").innerText().catch(() => "");
    if (!/planning your blueprint/i.test(text)) break;
    await sleep(3000);
  }

  const clicked = await clickFirst(page, [
    (p) => p.getByRole("button", { name: /^apply$/i }),
    (p) => p.getByRole("button", { name: /deploy blueprint/i }),
    (p) => p.locator("button:has-text('Apply')"),
    (p) => p.locator("button:has-text('Deploy Blueprint')"),
  ], 15000);

  if (clicked) {
    console.log("Blueprint deploy submitted on this Render account");
    await sleep(15000);
    await screenshot(page, "migrate-2-deployed.png");
  }
  return clicked;
}

async function discoverServiceUrls(page) {
  await page.goto("https://dashboard.render.com/", { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(4000);
  const urls = {};
  const body = await page.locator("body").innerText();

  for (const name of SERVICE_NAMES) {
    const link = page.getByRole("link", { name: new RegExp(name, "i") }).first();
    if (!(await link.isVisible({ timeout: 3000 }).catch(() => false))) continue;
    await link.click();
    await sleep(2000);
    const pageText = await page.locator("body").innerText();
    const match = pageText.match(/https:\/\/[a-z0-9-]+\.onrender\.com/i);
    if (match) urls[name] = match[0];
    await page.goBack().catch(() => page.goto("https://dashboard.render.com/"));
    await sleep(1500);
  }

  if (!Object.keys(urls).length) {
    const global = body.match(/crossroads-[a-z0-9-]+\.onrender\.com/gi) || [];
    global.forEach((u) => {
      const key = SERVICE_NAMES.find((s) => u.includes(s.replace("crossroads-", "")));
      if (key) urls[key] = `https://${u.replace(/^https?:\/\//, "")}`;
    });
  }

  return urls;
}

async function verifyApi(urls) {
  const apiUrl = urls["crossroads-api"];
  if (!apiUrl) return false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${apiUrl}/api/health`);
      const data = await res.json().catch(() => null);
      if (data?.ok) return true;
    } catch {}
    await sleep(10000);
  }
  return false;
}

async function signOutRender(page) {
  await page.goto("https://dashboard.render.com/logout", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await sleep(2000);
  const avatar = page.locator('[data-testid="user-menu"], button[aria-label*="account" i], .user-menu').first();
  if (await avatar.isVisible({ timeout: 3000 }).catch(() => false)) {
    await avatar.click();
    await sleep(500);
    await clickFirst(page, [
      (p) => p.getByRole("menuitem", { name: /sign out|log out/i }),
      (p) => p.locator("text=Sign Out"),
      (p) => p.locator("text=Log Out"),
    ]);
    await sleep(2000);
  }
}

async function main() {
  console.log("=== Migrate Crossroads HC to OTHER Render account ===");
  console.log("Chrome will sign OUT of Leaf's workspace.");
  console.log("Sign IN with your OTHER Render account when prompted.\n");

  let browser = await connectCdp();
  if (!browser) {
    browser = await launchChrome("https://dashboard.render.com/");
  }
  if (!browser) throw new Error("Chrome not available");

  const context = browser.contexts()[0];
  const page = context.pages()[0] || (await context.newPage());
  await page.bringToFront();

  await signOutRender(page);
  await page.goto("https://dashboard.render.com/login", { waitUntil: "domcontentloaded", timeout: 120000 });
  console.log("Waiting for OTHER account login (up to 5 min)...");
  const loggedIn = await waitForLogin(page);
  if (!loggedIn) {
    console.log("Sign in to your other Render account in Chrome, then run: npm run migrate");
    process.exit(1);
  }

  const body0 = await page.locator("body").innerText();
  if (/leaf's workspace/i.test(body0)) {
    console.log("WARNING: Still on Leaf's workspace — switch account before deploying.");
  }

  await screenshot(page, "migrate-0-dashboard.png");

  const body = body0;
  const alreadyThere = SERVICE_NAMES.every((s) => body.includes(s));

  if (!alreadyThere) {
    const ok = await deployBlueprint(page);
    if (!ok) {
      console.log("Could not click Deploy Blueprint — complete manually from migrate-1-blueprint.png");
    }
    console.log("Waiting 90s for services to appear...");
    await sleep(90000);
  } else {
    console.log("Services already on this account");
  }

  const urls = await discoverServiceUrls(page);
  console.log("\nDiscovered service URLs:");
  Object.entries(urls).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  const report = {
    migratedAt: new Date().toISOString(),
    blueprint: BLUEPRINT_NAME,
    services: urls,
    godaddyDns: {
      A: { name: "@", value: "216.24.57.1" },
      CNAME: [
        { name: "www", value: urls["crossroads-home"]?.replace("https://", "") || "crossroads-home.onrender.com" },
        { name: "api", value: urls["crossroads-api"]?.replace("https://", "") || "TBD" },
        { name: "book", value: urls["crossroads-book"]?.replace("https://", "") || "crossroads-book.onrender.com" },
        { name: "portal", value: urls["crossroads-portal"]?.replace("https://", "") || "crossroads-portal.onrender.com" },
        { name: "doctor", value: urls["crossroads-doctor"]?.replace("https://", "") || "crossroads-doctor.onrender.com" },
        { name: "admin", value: urls["crossroads-admin"]?.replace("https://", "") || "crossroads-admin.onrender.com" },
      ],
    },
    nextSteps: [
      "Add custom domains on each new service (crossroads.clinic subdomains)",
      "Update GoDaddy DNS CNAME targets to new onrender hostnames above",
      "Delete old services on crossroadshealthclinic26@gmail.com account",
    ],
  };

  writeFileSync(path.join(root, "migrate-report.json"), JSON.stringify(report, null, 2));
  console.log("\nWrote migrate-report.json");

  const live = await verifyApi(urls);
  console.log(live ? "\nAPI is LIVE on new account!" : "\nAPI still building — check dashboard");

  if (urls["crossroads-api"]) {
    console.log(`\nNew API: ${urls["crossroads-api"]}/api/health`);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});