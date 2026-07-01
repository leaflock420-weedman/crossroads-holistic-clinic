import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { existsSync } from "fs";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PLAYWRIGHT_ROOTS = [
  "C:\\Users\\wordo\\leaflock-hydro-crm",
  "C:\\Users\\wordo\\leaflock-pharmacy-crm",
];
const playwrightRoot = PLAYWRIGHT_ROOTS.find((p) => existsSync(path.join(p, "node_modules", "playwright")));
const { chromium } = require(require.resolve("playwright", { paths: [playwrightRoot] }));

const GITHUB_REPO = "https://github.com/leaflock420-weedman/crossroads-holistic-clinic";
const SERVICE_NAME = "crossroads-holistic-clinic-api";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function clickFirst(page, makers, timeout = 5000) {
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

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9225");
  const context = browser.contexts()[0];
  const page = (await context.newPage());
  await page.goto(`https://render.com/deploy?repo=${encodeURIComponent(GITHUB_REPO)}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await sleep(4000);

  const nameInput = page.getByLabel(/blueprint name/i).first();
  if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await nameInput.fill(SERVICE_NAME);
    console.log("Filled blueprint name:", SERVICE_NAME);
  }

  await page.screenshot({ path: path.join(root, "render-blueprint.png"), fullPage: true });

  const clicked = await clickFirst(page, [
    (p) => p.getByRole("button", { name: /deploy blueprint/i }),
    (p) => p.getByRole("button", { name: /^apply$/i }),
    (p) => p.locator("button:has-text('Deploy Blueprint')"),
  ], 10000);

  console.log(clicked ? "Deploy Blueprint clicked" : "Could not find Deploy Blueprint button — check render-blueprint.png");
  await sleep(8000);
  await page.screenshot({ path: path.join(root, "render-blueprint-after.png"), fullPage: true });
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});