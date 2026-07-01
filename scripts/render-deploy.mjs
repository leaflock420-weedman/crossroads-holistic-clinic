import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";

const require = createRequire(import.meta.url);
const PLAYWRIGHT_ROOTS = [
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "leaflock-hydro-crm"),
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "leaflock-pharmacy-crm"),
  "C:\\Users\\wordo\\leaflock-hydro-crm",
  "C:\\Users\\wordo\\leaflock-pharmacy-crm",
].filter((p, i, arr) => arr.indexOf(p) === i);
const playwrightRoot = PLAYWRIGHT_ROOTS.find((p) => existsSync(path.join(p, "node_modules", "playwright")));
if (!playwrightRoot) throw new Error("Playwright not found. Install it in leaflock-hydro-crm or leaflock-pharmacy-crm.");
const { chromium } = require(require.resolve("playwright", { paths: [playwrightRoot] }));

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BLUEPRINT_NAME = "crossroads-hc";
const API_HOST = "crossroads-api.onrender.com";
const GITHUB_REPO = "https://github.com/leaflock420-weedman/crossroads-holistic-clinic";
const DEPLOY_PROFILE = path.join(root, ".chrome-deploy-profile");
const CDP_PORTS = [9225, 9224, 9223, 9222, 9333];

const PORTAL_HOSTS = {
  home: "crossroads-home.onrender.com",
  book: "crossroads-book.onrender.com",
  portal: "crossroads-portal.onrender.com",
  doctor: "crossroads-doctor.onrender.com",
  admin: "crossroads-admin.onrender.com",
};

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function screenshot(page, name) {
  const file = path.join(root, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`Screenshot: ${name}`);
}

async function connectCdp() {
  for (const port of CDP_PORTS) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      console.log(`Connected to Chrome CDP on port ${port}`);
      return browser;
    } catch {}
  }
  return null;
}

async function launchDebugChrome() {
  const { spawn } = await import("child_process");
  const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  await mkdir(DEPLOY_PROFILE, { recursive: true });
  spawn(
    chrome,
    [
      "--remote-debugging-port=9225",
      `--user-data-dir=${DEPLOY_PROFILE}`,
      "--no-first-run",
      "--no-default-browser-check",
      "https://dashboard.render.com/",
    ],
    { detached: true, stdio: "ignore" }
  ).unref();
  console.log("Started Chrome on debug port 9225 — sign in as crossroadshealthclinic26@gmail.com if needed");
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const browser = await connectCdp();
    if (browser) return browser;
  }
  return null;
}

async function clickFirst(page, makers, timeout = 4000) {
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

async function fillFirst(page, makers, value) {
  for (const make of makers) {
    try {
      const el = make(page).first();
      if (await el.isVisible({ timeout: 2000 })) {
        await el.clear().catch(() => {});
        await el.fill(value);
        return true;
      }
    } catch {}
  }
  return false;
}

async function waitForLogin(page) {
  const body = await page.locator("body").innerText().catch(() => "");
  if (!/sign in to render/i.test(body)) return true;

  console.log("Sign in to Render as crossroadshealthclinic26@gmail.com (up to 3 minutes)...");
  const start = Date.now();
  while (Date.now() - start < 180000) {
    await sleep(3000);
    const text = await page.locator("body").innerText().catch(() => "");
    if (!/sign in to render/i.test(text)) {
      console.log("Render login detected");
      return true;
    }
  }
  return false;
}

async function deployBlueprint(page) {
  console.log("Opening Blueprint deploy...");
  await page.goto(`https://render.com/deploy?repo=${encodeURIComponent(GITHUB_REPO)}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await sleep(5000);
  await waitForLogin(page);
  await fillFirst(
    page,
    [(p) => p.getByLabel(/blueprint name/i), (p) => p.locator('input[type="text"]').first()],
    BLUEPRINT_NAME
  );
  await screenshot(page, "render-blueprint-deploy.png");

  const clicked = await clickFirst(
    page,
    [
      (p) => p.getByRole("button", { name: /deploy blueprint/i }),
      (p) => p.getByRole("button", { name: /^apply$/i }),
      (p) => p.locator("button:has-text('Deploy Blueprint')"),
      (p) => p.locator("button:has-text('Apply')"),
    ],
    10000
  );
  if (clicked) {
    console.log("Blueprint deploy submitted — 6 services (API + 5 portals)");
    await sleep(10000);
  }
  return clicked;
}

async function openService(page, name) {
  await page.goto("https://dashboard.render.com/", { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(3000);
  const link = page.getByRole("link", { name: new RegExp(name, "i") }).first();
  if (await link.isVisible({ timeout: 5000 }).catch(() => false)) {
    await link.click();
    await sleep(2000);
    return true;
  }
  return false;
}

async function verifyLive() {
  const apiBase = `https://${API_HOST}`;
  for (let attempt = 1; attempt <= 40; attempt++) {
    try {
      const healthRes = await fetch(`${apiBase}/api/health`);
      const healthText = await healthRes.text();
      let healthJson = null;
      try {
        healthJson = JSON.parse(healthText);
      } catch {}

      const portalRes = await fetch(`https://${PORTAL_HOSTS.portal}/`);
      const portalText = portalRes.ok ? await portalRes.text() : "";

      console.log(
        `API health=${healthRes.status} portal=${portalRes.status} (attempt ${attempt})`
      );

      if (healthJson?.ok && healthJson?.service === "crossroads-clinic" && portalText.includes("Patient portal")) {
        return true;
      }
    } catch (e) {
      console.log(`verify error: ${e.message} (attempt ${attempt})`);
    }
    await sleep(15000);
  }
  return false;
}

async function main() {
  let context;
  let ownsContext = false;

  let browser = await connectCdp();
  if (!browser) browser = await launchDebugChrome();
  if (browser) {
    context = browser.contexts()[0];
  } else {
    await mkdir(DEPLOY_PROFILE, { recursive: true });
    context = await chromium.launchPersistentContext(DEPLOY_PROFILE, {
      channel: "chrome",
      headless: false,
      viewport: { width: 1440, height: 900 },
      args: ["--disable-blink-features=AutomationControlled", "--remote-debugging-port=9225"],
    });
    ownsContext = true;
  }

  const page =
    context.pages().find((p) => /render/i.test(p.url())) || context.pages()[0] || (await context.newPage());
  await page.bringToFront();
  await page.goto("https://dashboard.render.com/", { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(3000);
  await waitForLogin(page);

  const hasApi = await openService(page, "crossroads-api");
  if (!hasApi) {
    await deployBlueprint(page);
  } else {
    console.log("crossroads-api already exists — open dashboard to sync blueprint if needed");
    await screenshot(page, "render-dashboard.png");
  }

  const ok = await verifyLive();
  if (ok) {
    console.log("SUCCESS — split portals live:");
    console.log(`  API:     https://${API_HOST}`);
    Object.entries(PORTAL_HOSTS).forEach(([k, h]) => console.log(`  ${k.padEnd(7)} https://${h}`));
  } else {
    console.log("Building — check Render dashboard. Expected URLs above.");
  }

  if (ownsContext) console.log("Chrome left open.");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});