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
const SERVICE_NAME = "crossroads-holistic-clinic";
const ONRENDER = "crossroads-holistic-clinic.onrender.com";
const GITHUB_REPO = "https://github.com/leaflock420-weedman/crossroads-holistic-clinic";
const PROFILE_CANDIDATES = [
  path.join(root, ".chrome-deploy-profile"),
  path.join(path.dirname(root), "leaflock-pharmacy-crm", ".chrome-render-profile"),
  path.join(path.dirname(root), "route-runner", ".chrome-deploy-profile"),
];
const CDP_PORTS = [9225, 9224, 9223, 9222, 9333];
const DEPLOY_PROFILE = path.join(root, ".chrome-deploy-profile");

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
      `https://render.com/deploy?repo=${encodeURIComponent(GITHUB_REPO)}`,
    ],
    { detached: true, stdio: "ignore" }
  ).unref();
  console.log("Started Chrome on debug port 9225");
  for (let i = 0; i < 20; i++) {
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

  console.log("Sign in to Render in the Chrome window (up to 3 minutes)...");
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

async function fillBlueprintName(page) {
  return fillFirst(
    page,
    [(p) => p.getByLabel(/blueprint name/i), (p) => p.locator('input[type="text"]').first()],
    SERVICE_NAME
  );
}

async function deployViaOneClick(page) {
  console.log("Opening one-click Blueprint deploy...");
  await page.goto(`https://render.com/deploy?repo=${encodeURIComponent(GITHUB_REPO)}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await sleep(5000);
  await waitForLogin(page);
  await fillBlueprintName(page);
  await screenshot(page, "render-step-1-deploy.png");

  return clickFirst(
    page,
    [
      (p) => p.getByRole("button", { name: /deploy blueprint/i }),
      (p) => p.getByRole("button", { name: /^apply$/i }),
      (p) => p.locator("button:has-text('Deploy Blueprint')"),
      (p) => p.locator("button:has-text('Apply')"),
    ],
    10000
  );
}

async function openExistingService(page) {
  await page.goto("https://dashboard.render.com/", { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(3000);
  const link = page.getByRole("link", { name: new RegExp(SERVICE_NAME, "i") }).first();
  if (await link.isVisible({ timeout: 5000 }).catch(() => false)) {
    await link.click();
    await sleep(3000);
    return true;
  }
  return false;
}

async function triggerManualDeploy(page) {
  const ok = await clickFirst(
    page,
    [
      (p) => p.getByRole("button", { name: /manual deploy/i }),
      (p) => p.locator("button:has-text('Manual Deploy')"),
    ],
    5000
  );
  if (ok) {
    await clickFirst(
      page,
      [
        (p) => p.getByRole("menuitem", { name: /deploy latest commit/i }),
        (p) => p.locator("text=Deploy latest commit"),
      ],
      3000
    );
    console.log("Manual deploy triggered");
  }
  return ok;
}

async function verifyLive() {
  const base = `https://${ONRENDER}`;
  for (let attempt = 1; attempt <= 40; attempt++) {
    try {
      const [home, health, portal] = await Promise.all([
        fetch(`${base}/`, { redirect: "follow" }),
        fetch(`${base}/api/health`),
        fetch(`${base}/portal`),
      ]);
      const healthJson = health.ok ? await health.json().catch(() => null) : null;
      const homeText = home.ok ? await home.text() : "";
      const portalText = portal.ok ? await portal.text() : "";
      console.log(
        `${base} home=${home.status} health=${health.status} portal=${portal.status} (attempt ${attempt})`
      );
      if (
        home.status === 200 &&
        homeText.includes("Crossroads") &&
        healthJson?.ok &&
        healthJson?.service === "crossroads-clinic" &&
        portalText.includes("Patient portal")
      ) {
        return true;
      }
    } catch (e) {
      console.log(`${base} -> error: ${e.message} (attempt ${attempt})`);
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
    const profile = PROFILE_CANDIDATES.find((p) => existsSync(p)) || DEPLOY_PROFILE;
    console.log(`Launching Chrome with profile: ${profile}`);
    await mkdir(profile, { recursive: true });
    context = await chromium.launchPersistentContext(profile, {
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

  let onService = await openExistingService(page);
  if (!onService) {
    const ok = await deployViaOneClick(page);
    if (ok) {
      console.log("Blueprint deploy submitted");
      await sleep(8000);
    }
    onService = await openExistingService(page);
  }

  if (onService) await triggerManualDeploy(page);

  await screenshot(page, "render-deploy.png");

  const ok = await verifyLive();
  console.log(ok ? `SUCCESS — https://${ONRENDER}` : `Building — check https://${ONRENDER}`);

  if (ownsContext) console.log("Chrome left open for any remaining steps.");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});