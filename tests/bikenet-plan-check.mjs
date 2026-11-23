// /2026/BoulderBikeNet "with the plan built": each example ride today vs with each method's plan,
// the "gets better at X mi" jump, the agreement view, and the plan on a phone.
//   node tests/bikenet-plan-check.mjs <base_url> <shot_dir>
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:5173";
const out = process.argv[3] ?? "tests/screenshots/bikenet";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const flat = (s) => s.replace(/\s+/g, " ").trim();

async function open(viewport) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${base}/2026/BoulderBikeNet`);
  await page.waitForSelector(".bbn-list li");
  return page;
}

// ---- Network: agreement view + rank badges ----
const page = await open({ width: 1400, height: 900 });
await page.waitForTimeout(1200);
console.log("rank badges on map:", await page.locator(".bbn-rank").count());
console.log("slider context:", flat(await page.locator(".bbn-range + .bbn-small").innerText()));
await page.screenshot({ path: `${out}/p1-network-ranks.png` });
await page.locator(".bbn-adv summary").click();
await page.getByLabel("Where the methods agree").check();
await page.waitForTimeout(600);
console.log("agree list:", flat(await page.locator(".bbn-list").innerText()).slice(0, 300));
await page.screenshot({ path: `${out}/p2-agree.png` });
await page.getByLabel("Extend today's network").check();

// ---- Route: each example, today vs plan, per method ----
await page.getByRole("tab", { name: "Your route" }).click();
await page.waitForSelector(".bbn-examples button:not([disabled])", { timeout: 20000 });
const n = await page.locator(".bbn-examples button").count();
for (let i = 0; i < n; i++) {
  await page.locator(".bbn-examples button").nth(i).click();
  await page.waitForSelector(".bbn-big");
  const name = flat(await page.locator(".bbn-examples button").nth(i).innerText());
  await page.getByRole("button", { name: "With the plan built" }).click();
  await page.waitForSelector(".bbn-plan");
  console.log(`\n${name}`);
  for (const tool of ["grow_existing", "agree", "fix", "link"]) {
    await page.locator(".bbn-plan select").selectOption(tool);
    await page.waitForTimeout(250);
    const t0 = Date.now();
    const txt = flat(await page.locator(".bbn-plan").innerText());
    console.log(`  ${tool} (${Date.now() - t0} ms): ${txt.replace(/^The plan .*?(Show the first|Off the road|None|Nothing|This ride)/, "$1").slice(0, 260)}`);
  }
  await page.locator(".bbn-plan select").selectOption("grow_existing");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/p3-plan-example-${i}.png` });
  await page.getByRole("button", { name: "Today", exact: true }).click();
}

// "Show that": jump the slider to where a ride first improves
await page.locator(".bbn-examples button").nth(1).click();
await page.getByRole("button", { name: "With the plan built" }).click();
await page.locator(".bbn-plan select").selectOption("grow_existing");
await page.locator(".bbn-plan .bbn-range").fill("1");
await page.waitForTimeout(400);
const showThat = page.locator(".bbn-plan").getByRole("button", { name: "Show that" });
if (await showThat.count()) {
  console.log("\nat 1 mi:", flat(await page.locator(".bbn-plan").innerText()).slice(0, 220));
  await showThat.click();
  await page.waitForTimeout(400);
  console.log("after Show that:", flat(await page.locator(".bbn-plan").innerText()).slice(0, 260));
} else console.log("\nat 1 mi: no 'Show that' (", flat(await page.locator(".bbn-plan").innerText()).slice(0, 200), ")");
await page.screenshot({ path: `${out}/p4-show-that.png` });

// ---- Phone ----
const phone = await open({ width: 390, height: 844 });
await phone.getByRole("tab", { name: "Your route" }).click();
await phone.waitForSelector(".bbn-examples button:not([disabled])", { timeout: 20000 });
await phone.locator(".bbn-examples button").first().click();
await phone.getByRole("button", { name: "With the plan built" }).click();
await phone.waitForSelector(".bbn-plan");
await phone.waitForTimeout(1200);
await phone.screenshot({ path: `${out}/p5-phone-plan.png`, fullPage: true });
console.log(`\nphone horizontal overflow: ${await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)}px`);

console.log("errors:", errors.length ? errors : "none");
await browser.close();
