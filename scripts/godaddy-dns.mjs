/**
 * Configure crossroads.clinic DNS on GoDaddy + add custom domains on Render.
 * Requires Chrome with remote debugging (port 9225) logged into GoDaddy + Render.
 */
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { existsSync, mkdirSync } from "fs";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PLAYWRIGHT_ROOTS = [
  "C:\\Users\\wordo\\leaflock-hydro-crm",
  "C:\\Users\\wordo\\leaflock-pharmacy-crm",
];
const playwrightRoot = PLAYWRIGHT_ROOTS.find((p) => existsSync(path.join(p, "node_modules", "playwright")));
if (!playwrightRoot) throw new Error("Playwright not found");
const { chromium } = require(require.resolve("playwright", { paths: [playwrightRoot] }));

const GODADDY_DNS =
  "https://dcc.godaddy.com/control/portfolio/crossroads.clinic/settings?tab=dns";
const RENDER_APEX_IP = "216.24.57.1";

const DNS_RECORDS = [
  { type: "A", name: "@", value: RENDER_APEX_IP, ttl: 600 },
  { type: "CNAME", name: "www", value: "crossroads-home.onrender.com", ttl: 600 },
  { type: "CNAME", name: "api", value: "crossroads-api-u6nu.onrender.com", ttl: 600 },
  { type: "CNAME", name: "book", value: "crossroads-book.onrender.com", ttl: 600 },
  { type: "CNAME", name: "portal", value: "crossroads-portal.onrender.com", ttl: 600 },
  { type: "CNAME", name: "doctor", value: "crossroads-doctor.onrender.com", ttl: 600 },
  { type: "CNAME", name: "admin", value: "crossroads-admin.onrender.com", ttl: 600 },
];

const RENDER_DOMAINS = [
  { service: "crossroads-home", domains: ["crossroads.clinic", "www.crossroads.clinic"] },
  { service: "crossroads-api", domains: ["api.crossroads.clinic"] },
  { service: "crossroads-book", domains: ["book.crossroads.clinic"] },
  { service: "crossroads-portal", domains: ["portal.crossroads.clinic"] },
  { service: "crossroads-doctor", domains: ["doctor.crossroads.clinic"] },
  { service: "crossroads-admin", domains: ["admin.crossroads.clinic"] },
];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function screenshot(page, name) {
  const file = path.join(root, name);
  await page.screenshot({ path: file, fullPage: true });
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

async function launchChrome() {
  const { spawn } = await import("child_process");
  const profile = path.join(root, ".chrome-deploy-profile");
  mkdirSync(profile, { recursive: true });
  spawn(
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    [
      "--remote-debugging-port=9225",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      GODADDY_DNS,
    ],
    { detached: true, stdio: "ignore" }
  ).unref();
  for (let i = 0; i < 25; i++) {
    await sleep(1000);
    const b = await connectCdp();
    if (b) return b;
  }
  return null;
}

async function waitForText(page, pattern, ms = 180000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const text = await page.locator("body").innerText().catch(() => "");
    if (pattern.test(text)) return true;
    await sleep(2000);
  }
  return false;
}

async function addRenderDomain(page, serviceName, domain) {
  await page.goto(`https://dashboard.render.com/`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2000);
  const link = page.getByRole("link", { name: new RegExp(serviceName, "i") }).first();
  if (!(await link.isVisible({ timeout: 8000 }).catch(() => false))) {
    console.log(`Render service not found: ${serviceName}`);
    return false;
  }
  await link.click();
  await sleep(2000);
  await page.goto(page.url().replace(/\/$/, "") + "/settings", { waitUntil: "domcontentloaded" });
  await sleep(3000);

  const body = await page.locator("body").innerText();
  if (body.includes(domain)) {
    console.log(`Render: ${domain} already on ${serviceName}`);
    return true;
  }

  const addBtn = page.getByRole("button", { name: /add custom domain/i }).first();
  if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await addBtn.click();
    await sleep(1000);
  }

  const input = page.locator('input[placeholder*="domain" i], input[name*="domain" i]').first();
  if (await input.isVisible({ timeout: 5000 }).catch(() => false)) {
    await input.fill(domain);
    await sleep(500);
    await page.getByRole("button", { name: /save|add/i }).first().click().catch(() => {});
    await sleep(2000);
    console.log(`Render: added ${domain} → ${serviceName}`);
    return true;
  }

  await screenshot(page, `render-domain-${serviceName}.png`);
  console.log(`Render: could not add ${domain} — see screenshot`);
  return false;
}

async function configureGoDaddyDns(page) {
  await page.goto(GODADDY_DNS, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(5000);
  await screenshot(page, "godaddy-dns-before.png");

  const loggedIn = await waitForText(page, /DNS Records|Manage DNS|Add Record/i, 120000);
  if (!loggedIn) {
    console.log("GoDaddy: sign in required — log in as crossroadshealthclinic26@gmail.com in Chrome");
    await screenshot(page, "godaddy-login-needed.png");
    return false;
  }

  for (const rec of DNS_RECORDS) {
    console.log(`GoDaddy: ensuring ${rec.type} ${rec.name} → ${rec.value}`);

    const addRecord = page.getByRole("button", { name: /add.*record|add new record/i }).first();
    if (await addRecord.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addRecord.click();
      await sleep(1500);
    }

    const typeSelect = page.locator("select").filter({ hasText: /A|CNAME/i }).first();
    if (await typeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await typeSelect.selectOption(rec.type).catch(() => {});
    }

    const nameInput = page.getByLabel(/name|host/i).first();
    if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nameInput.fill(rec.name === "@" ? "@" : rec.name);
    }

    const valueInput = page.getByLabel(/value|points to|data/i).first();
    if (await valueInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await valueInput.fill(rec.value);
    }

    await page.getByRole("button", { name: /save|add record/i }).first().click().catch(() => {});
    await sleep(2000);
  }

  await screenshot(page, "godaddy-dns-after.png");
  return true;
}

async function main() {
  let browser = await connectCdp();
  if (!browser) browser = await launchChrome();
  if (!browser) throw new Error("Could not connect to Chrome");

  const context = browser.contexts()[0];
  const page = context.pages()[0] || (await context.newPage());
  await page.bringToFront();

  console.log("Step 1: GoDaddy DNS records...");
  const dnsOk = await configureGoDaddyDns(page);

  console.log("Step 2: Render custom domains...");
  for (const { service, domains } of RENDER_DOMAINS) {
    for (const domain of domains) {
      await addRenderDomain(page, service, domain);
    }
  }

  console.log(dnsOk ? "DNS configuration attempted — allow 5–30 min to propagate" : "GoDaddy needs manual login");
  console.log("\nExpected records:");
  DNS_RECORDS.forEach((r) => console.log(`  ${r.type}  ${r.name}  →  ${r.value}`));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});