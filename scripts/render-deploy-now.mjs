/** Manual deploy crossroads-api + crossroads-home on Crossroads HC */
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

const SERVICES = [
  { name: "crossroads-api", url: "https://dashboard.render.com/web/srv-d92itbuq1p3s73fshvbg" },
  { name: "crossroads-home", url: "https://dashboard.render.com/static/srv-d92itbuq1p3s73fshva0" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function deployService(page, service) {
  await page.goto(service.url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(3000);
  const deploy = page.getByRole("button", { name: /manual deploy|deploy latest/i }).first();
  if (await deploy.isVisible({ timeout: 5000 }).catch(() => false)) {
    await deploy.click({ force: true });
    await sleep(1000);
    const confirm = page.getByRole("menuitem", { name: /deploy/i }).or(page.getByRole("button", { name: /^deploy$/i }));
    if (await confirm.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirm.first().click({ force: true });
    }
    await sleep(5000);
    console.log(`Deploying ${service.name}`);
    return;
  }
  console.log(`No deploy button for ${service.name} — may already be building`);
}

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9225");
  const page = browser.contexts()[0].pages().find((p) => /render/i.test(p.url())) || browser.contexts()[0].pages()[0];
  for (const s of SERVICES) await deployService(page, s);
  console.log("Deploy triggered for api + home");
  await page.screenshot({ path: path.join(root, "render-deploy-now.png"), fullPage: true });
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});