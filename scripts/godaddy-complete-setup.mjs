/**
 * Complete GoDaddy setup for Crossroads HC 2-domain architecture.
 * - Apex A → Render
 * - www/api CNAME → Crossroads HC onrender URLs
 * - book/portal/doctor/admin → forward to path URLs on apex
 */
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { existsSync } from "fs";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pw = ["C:\\Users\\wordo\\leaflock-hydro-crm", "C:\\Users\\wordo\\leaflock-pharmacy-crm"].find((p) =>
  existsSync(path.join(p, "node_modules", "playwright"))
);
const { chromium } = require(require.resolve("playwright", { paths: [pw] }));

const DNS_URL = "https://dcc.godaddy.com/control/portfolio/crossroads.clinic/settings?tab=dns";
const FWD_URL = "https://dcc.godaddy.com/control/portfolio/crossroads.clinic/settings?tab=forwarding";

const CNAMES = [
  { name: "www", value: "crossroads-home-zj2s.onrender.com" },
  { name: "api", value: "crossroads-api-u33v.onrender.com" },
];

const FORWARDS = [
  { sub: "book", to: "https://crossroads.clinic/start.html" },
  { sub: "portal", to: "https://crossroads.clinic/portal.html" },
  { sub: "doctor", to: "https://crossroads.clinic/doctor.html" },
  { sub: "admin", to: "https://crossroads.clinic/admin.html" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (const port of [9225, 9224, 9223]) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch {}
  }
  throw new Error("Open Chrome signed into GoDaddy");
}

async function clickSave(page) {
  for (const sel of [
    () => page.getByRole("button", { name: /^save$/i }).last(),
    () => page.locator('button:visible').filter({ hasText: /^Save$/ }).last(),
  ]) {
    const b = sel();
    if (await b.isVisible({ timeout: 2000 }).catch(() => false)) {
      await b.click({ force: true });
      await sleep(3000);
      return;
    }
  }
}

async function deletePbqlAndSubs(page) {
  for (const name of ["www", "api", "book", "portal", "doctor", "admin"]) {
    const rows = page.locator("tr").filter({ hasText: /CNAME/i }).filter({ hasText: new RegExp(`\\b${name}\\b`, "i") });
    const n = await rows.count();
    for (let i = n - 1; i >= 0; i--) {
      const row = rows.nth(i);
      const text = await row.innerText();
      if (/pbql|onrender/i.test(text)) {
        await row.locator("button").last().click({ force: true });
        await sleep(600);
        await page.getByRole("button", { name: /delete|confirm|yes/i }).first().click({ force: true }).catch(() => {});
        await sleep(2000);
        console.log(`Deleted CNAME ${name}`);
      }
    }
  }
}

async function upsertCname(page, name, value) {
  const body = await page.locator("body").innerText();
  if (body.includes(name) && body.includes(value.replace(".onrender.com", ""))) {
    console.log(`OK CNAME ${name}`);
    return;
  }
  const row = page.locator("tr").filter({ hasText: /CNAME/i }).filter({ hasText: new RegExp(`\\b${name}\\b`, "i") }).first();
  if (await row.isVisible({ timeout: 2000 }).catch(() => false)) {
    const btns = row.locator("button");
    const c = await btns.count();
    if (c >= 2) {
      await btns.nth(c - 2).click({ force: true });
      await sleep(1200);
      const inputs = page.locator("input:visible");
      for (let j = (await inputs.count()) - 1; j >= 0; j--) {
        const v = await inputs.nth(j).inputValue().catch(() => "");
        if (v.includes("onrender") || v.includes("crossroads")) {
          await inputs.nth(j).fill(value);
          break;
        }
      }
      await clickSave(page);
      console.log(`Updated CNAME ${name}`);
      return;
    }
  }
  await page.getByRole("button", { name: /add new record/i }).click({ force: true });
  await sleep(2000);
  await page.locator("select:visible").first().selectOption("CNAME").catch(() => {});
  const inputs = page.locator("input[type='text']:visible");
  const ic = await inputs.count();
  if (ic >= 2) {
    await inputs.nth(ic - 2).fill(name);
    await inputs.nth(ic - 1).fill(value);
  }
  await clickSave(page);
  console.log(`Added CNAME ${name}`);
}

async function ensureApexA(page) {
  const body = await page.locator("body").innerText();
  if (body.includes("216.24.57.1") || body.match(/A\s+@/)) {
    console.log("OK apex A record");
    return;
  }
  await page.getByRole("button", { name: /add new record/i }).click({ force: true });
  await sleep(1500);
  await page.locator("select:visible").first().selectOption("A").catch(() => {});
  const inputs = page.locator("input[type='text']:visible");
  const ic = await inputs.count();
  if (ic >= 2) {
    await inputs.nth(ic - 2).fill("@");
    await inputs.nth(ic - 1).fill("216.24.57.1");
  }
  await clickSave(page);
  console.log("Added apex A → 216.24.57.1");
}

async function setupForwarding(page) {
  await page.goto(FWD_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(5000);
  const body = await page.locator("body").innerText();
  console.log("Forwarding tab:", body.slice(0, 500));

  for (const { sub, to } of FORWARDS) {
    if (body.includes(sub) && body.includes(to)) {
      console.log(`OK forward ${sub}`);
      continue;
    }
    const add = page.getByRole("button", { name: /add|forward|create/i }).first();
    if (await add.isVisible({ timeout: 3000 }).catch(() => false)) {
      await add.click({ force: true });
      await sleep(1500);
    }
    const inputs = page.locator("input:visible");
    const ic = await inputs.count();
    for (let i = 0; i < ic; i++) {
      const ph = await inputs.nth(i).getAttribute("placeholder").catch(() => "");
      const name = await inputs.nth(i).getAttribute("name").catch(() => "");
      if (/sub|host|domain/i.test(ph + name)) await inputs.nth(i).fill(sub);
      if (/url|forward|destination|https/i.test(ph + name)) await inputs.nth(i).fill(to);
    }
    if (ic >= 2) {
      await inputs.nth(0).fill(sub).catch(() => {});
      await inputs.nth(ic - 1).fill(to).catch(() => {});
    }
    await clickSave(page);
    console.log(`Forward ${sub} → ${to}`);
    await page.goto(FWD_URL, { waitUntil: "domcontentloaded" });
    await sleep(3000);
  }
}

async function main() {
  const browser = await connect();
  const ctx = browser.contexts()[0];
  let page = ctx.pages().find((p) => /godaddy/i.test(p.url())) || (await ctx.newPage());
  await page.goto(DNS_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(6000);

  await deletePbqlAndSubs(page);
  await page.goto(DNS_URL, { waitUntil: "domcontentloaded" });
  await sleep(4000);
  await ensureApexA(page);
  await page.goto(DNS_URL, { waitUntil: "domcontentloaded" });
  await sleep(3000);
  for (const c of CNAMES) {
    await upsertCname(page, c.name, c.value);
    await page.goto(DNS_URL, { waitUntil: "domcontentloaded" });
    await sleep(2500);
  }

  await setupForwarding(page);
  await page.screenshot({ path: path.join(root, "godaddy-complete.png"), fullPage: true });
  console.log("GoDaddy setup complete");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});