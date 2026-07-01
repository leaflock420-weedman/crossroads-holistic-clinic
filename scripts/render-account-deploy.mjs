/**
 * Deploy crossroads-hc blueprint on Render account usr-d92i20taeets73ekgd8g
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
const ACCOUNT_SETTINGS = "https://dashboard.render.com/u/usr-d92i20taeets73ekgd8g/settings";
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

async function shot(page, name) {
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

async function clickFirst(page, makers, timeout = 6000) {
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

async function waitDashboard(page) {
  for (let i = 0; i < 60; i++) {
    const text = await page.locator("body").innerText().catch(() => "");
    if (/sign in to render/i.test(text)) {
      console.log("Render login required — sign in in Chrome");
      await sleep(5000);
      continue;
    }
    if (/usr-d92i20taeets73ekgd8g|settings|dashboard|services/i.test(text)) return true;
    await sleep(3000);
  }
  return false;
}

async function deployBlueprint(page) {
  const url = `https://render.com/deploy?repo=${encodeURIComponent(GITHUB_REPO)}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(5000);
  await shot(page, "account-deploy-1-blueprint.png");

  const nameInput = page.getByLabel(/blueprint name/i).first();
  if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await nameInput.fill(BLUEPRINT_NAME);
  }

  const pathInput = page.getByLabel(/blueprint path/i).first();
  if (await pathInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await pathInput.clear().catch(() => {});
    await pathInput.fill("render.yaml");
  }

  for (let i = 0; i < 60; i++) {
    const text = await page.locator("body").innerText().catch(() => "");
    if (/planning your blueprint/i.test(text)) {
      await sleep(3000);
      continue;
    }
    const ok = await clickFirst(page, [
      (p) => p.getByRole("button", { name: /^apply$/i }),
      (p) => p.getByRole("button", { name: /deploy blueprint/i }),
      (p) => p.locator("button:has-text('Apply')"),
    ], 2000);
    if (ok) {
      console.log("Blueprint Apply clicked");
      await sleep(20000);
      await shot(page, "account-deploy-2-applied.png");
      return true;
    }
    if (/already exists|blueprint.*created/i.test(text)) return true;
    await sleep(3000);
  }

  await shot(page, "account-deploy-failed.png");
  return false;
}

async function discoverUrls(page) {
  await page.goto("https://dashboard.render.com/", { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(4000);
  const urls = {};
  const body = await page.locator("body").innerText();

  for (const name of SERVICE_NAMES) {
    const link = page.getByRole("link", { name: new RegExp(name, "i") }).first();
    if (!(await link.isVisible({ timeout: 2000 }).catch(() => false))) continue;
    await link.click();
    await sleep(2500);
    const t = await page.locator("body").innerText();
    const m = t.match(/https:\/\/crossroads-[a-z0-9-]+\.onrender\.com/i);
    if (m) urls[name] = m[0];
    await page.goto("https://dashboard.render.com/");
    await sleep(1500);
  }

  if (!Object.keys(urls).length) {
    const all = body.match(/https:\/\/crossroads-[a-z0-9-]+\.onrender\.com/gi) || [];
    all.forEach((u) => {
      SERVICE_NAMES.forEach((s) => {
        const slug = s.replace("crossroads-", "");
        if (u.includes(slug) && !urls[s]) urls[s] = u;
      });
    });
  }
  return urls;
}

async function verifyApi(urls) {
  const api = urls["crossroads-api"];
  if (!api) return false;
  for (let i = 0; i < 24; i++) {
    try {
      const res = await fetch(`${api}/api/health`);
      const data = await res.json().catch(() => null);
      if (data?.ok) return true;
    } catch {}
    await sleep(10000);
  }
  return false;
}

async function main() {
  let browser = await connectCdp();
  if (!browser) browser = await launchChrome(ACCOUNT_SETTINGS);
  if (!browser) throw new Error("Chrome not available");

  const page = browser.contexts()[0].pages()[0] || (await browser.contexts()[0].newPage());
  await page.bringToFront();
  await page.goto(ACCOUNT_SETTINGS, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(3000);
  await waitDashboard(page);
  await shot(page, "account-deploy-0-settings.png");

  const dash = await page.locator("body").innerText();
  const hasAll = SERVICE_NAMES.every((s) => dash.includes(s));

  if (!hasAll) {
    console.log("Deploying blueprint on account usr-d92i20taeets73ekgd8g...");
    await deployBlueprint(page);
  } else {
    console.log("All 6 services already present");
  }

  const urls = await discoverUrls(page);
  console.log("\nService URLs:");
  Object.entries(urls).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  const report = {
    account: "usr-d92i20taeets73ekgd8g",
    services: urls,
    apiLive: await verifyApi(urls),
    godaddyCname: {
      api: urls["crossroads-api"]?.replace("https://", ""),
      www: urls["crossroads-home"]?.replace("https://", ""),
      book: urls["crossroads-book"]?.replace("https://", ""),
      portal: urls["crossroads-portal"]?.replace("https://", ""),
      doctor: urls["crossroads-doctor"]?.replace("https://", ""),
      admin: urls["crossroads-admin"]?.replace("https://", ""),
    },
  };
  writeFileSync(path.join(root, "migrate-report.json"), JSON.stringify(report, null, 2));
  console.log("\nWrote migrate-report.json");
  console.log(report.apiLive ? "API LIVE" : "API still building");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});