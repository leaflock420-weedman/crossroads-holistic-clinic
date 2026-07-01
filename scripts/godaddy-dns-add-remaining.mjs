/** Final GoDaddy DNS: apex A + www + api → Crossroads HC */
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

const URL = "https://dcc.godaddy.com/control/portfolio/crossroads.clinic/settings?tab=dns";
const APEX_IP = "216.24.57.1";

const CNAMES = [
  { name: "www", value: "crossroads-home-zj2s.onrender.com" },
  { name: "api", value: "crossroads-api-u33v.onrender.com" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function saveForm(page) {
  for (const sel of [
    () => page.getByRole("button", { name: /^save$/i }).last(),
    () => page.locator("button").filter({ hasText: /^Save$/ }).last(),
  ]) {
    const btn = sel();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click({ force: true });
      await sleep(3500);
      return;
    }
  }
}

async function deletePbql(page) {
  const rows = page.locator("tr").filter({ hasText: /pbql/i });
  for (let i = (await rows.count()) - 1; i >= 0; i--) {
    await rows.nth(i).locator("button").last().click({ force: true });
    await sleep(700);
    await page.getByRole("button", { name: /delete|confirm|yes/i }).first().click({ force: true }).catch(() => {});
    await sleep(2000);
    console.log("Deleted pbql");
  }
}

async function ensureApex(page) {
  const body = await page.locator("body").innerText();
  if (body.includes(APEX_IP)) {
    console.log("OK @ apex");
    return;
  }
  await page.getByRole("button", { name: /add new record/i }).click({ force: true });
  await sleep(2000);
  await page.locator("select:visible").first().selectOption("A").catch(() => {});
  const inputs = page.locator("input").filter({ hasNot: page.locator('[type="checkbox"]') }).filter({ hasNot: page.locator("[disabled]") });
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    const ph = await inputs.nth(i).getAttribute("placeholder").catch(() => "");
    if (/name|host/i.test(ph) || i === n - 2) await inputs.nth(i).fill("@").catch(() => {});
  }
  await inputs.last().fill(APEX_IP);
  await saveForm(page);
  console.log("Added @ A →", APEX_IP);
}

async function upsertCname(page, name, value) {
  const body = await page.locator("body").innerText();
  if (body.includes(name) && body.includes(value.replace(".onrender.com", ""))) {
    console.log(`OK ${name}`);
    return;
  }
  const row = page.locator("tr").filter({ hasText: /CNAME/i }).filter({ hasText: new RegExp(`\\b${name}\\b`) }).first();
  if (await row.isVisible({ timeout: 2000 }).catch(() => false)) {
    const btns = row.locator("button");
    await btns.nth((await btns.count()) - 2).click({ force: true });
    await sleep(1200);
    const inputs = page.locator("input").filter({ hasNot: page.locator('[type="checkbox"]') });
    for (let j = (await inputs.count()) - 1; j >= 0; j--) {
      const v = await inputs.nth(j).inputValue().catch(() => "");
      if (v.includes("onrender") || v.includes("crossroads") || v.includes("pbql")) {
        await inputs.nth(j).fill(value);
        break;
      }
    }
    await saveForm(page);
    console.log(`Updated ${name}`);
    return;
  }
  await page.getByRole("button", { name: /add new record/i }).click({ force: true });
  await sleep(2000);
  await page.locator("select:visible").first().selectOption("CNAME").catch(() => {});
  const inputs = page.locator("input").filter({ hasNot: page.locator('[type="checkbox"]') });
  const c = await inputs.count();
  if (c >= 2) {
    await inputs.nth(c - 2).fill(name);
    await inputs.nth(c - 1).fill(value);
  }
  await saveForm(page);
  console.log(`Added ${name}`);
}

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9225");
  const page = browser.contexts()[0].pages().find((p) => /godaddy/i.test(p.url())) || (await browser.contexts()[0].newPage());
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(5000);
  await deletePbql(page);
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await sleep(4000);
  await ensureApex(page);
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await sleep(3000);
  for (const r of CNAMES) {
    await upsertCname(page, r.name, r.value);
    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await sleep(2500);
  }
  console.log("Done");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});