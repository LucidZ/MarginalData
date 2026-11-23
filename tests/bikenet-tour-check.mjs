// /2026/BoulderBikeNet tour: walk every step (desktop + phone), Back lands on the same picture,
// finishing opens an empty route, skipping restores the network defaults.
//   node tests/bikenet-tour-check.mjs <base_url> <shot_dir>
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

async function walk(page, tag) {
  await page.getByRole("button", { name: /Take the 1-minute tour/ }).click();
  const n = await page.locator(".bbn-tour-dots i").count();
  for (let i = 0; i < n; i++) {
    await page.waitForTimeout(i === 2 ? 3000 : 900); // Extend grows in over 2.4 s
    if (i === n - 1) await page.waitForSelector(".bbn-tour .bbn-delta", { timeout: 20000 });
    const txt = flat(await page.locator(".bbn-tour").innerText());
    const ranks = await page.locator(".bbn-rank").count();
    const slider = await page.evaluate(() => document.querySelector(".bbn-tour") && null);
    console.log(`[${tag} ${i + 1}/${n}] badges=${ranks}${slider ?? ""} :: ${txt}\n`);
    await page.screenshot({ path: `${out}/t-${tag}-${i + 1}.png` });
    if (i < n - 1) await page.getByRole("button", { name: "Next" }).click();
  }
}

// ---- Desktop ----
const page = await open({ width: 1400, height: 900 });
await walk(page, "desk");
// Back from the ride lands on the agreement view again
await page.getByRole("button", { name: "Back" }).click();
await page.waitForTimeout(600);
console.log("back ->", flat(await page.locator(".bbn-tour h2").innerText()), "| mode tabs visible:", await page.locator(".bbn-modes").count());
await page.getByRole("button", { name: "Next" }).click();
await page.waitForSelector(".bbn-tour .bbn-delta");
await page.getByRole("button", { name: "Plot your own route" }).click();
await page.waitForTimeout(500);
const inputs = await page.locator(".bbn-search input").evaluateAll((els) => els.map((e) => e.value));
const focused = await page.evaluate(() => document.activeElement?.getAttribute("placeholder"));
const tab = flat(await page.locator(".bbn-modes [aria-selected=true]").innerText());
console.log("finish -> tab:", tab, "| inputs:", JSON.stringify(inputs), "| focus:", focused, "| plan box:", await page.locator(".bbn-plan").count());
await page.screenshot({ path: `${out}/t-desk-finish.png` });

// Skip from the middle (Escape) restores the network defaults
await page.getByRole("tab", { name: "The network" }).click();
await page.getByRole("button", { name: /Take the 1-minute tour/ }).click();
for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
await page.waitForTimeout(400);
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
console.log(
  "skip -> tab:", flat(await page.locator(".bbn-modes [aria-selected=true]").innerText()),
  "| method:", flat(await page.locator(".bbn-rec").innerText()),
  "| slider:", flat(await page.locator(".bbn-range + .bbn-small").innerText()),
  "| photo open:", await page.locator(".bbn-photo").count(),
);

// ---- Phone ----
const ph = await open({ width: 390, height: 844 });
await ph.screenshot({ path: `${out}/t-phone-0.png` });
await walk(ph, "phone");

console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no page errors");
await browser.close();
