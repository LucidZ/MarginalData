// /2026/BoulderBikeNet app shell: on desktop, scrolling the panel never scrolls the page (map stays put);
// on a phone the panel is a bottom sheet over a full-height map (peek / half / full, tap or drag the handle).
//   node tests/bikenet-shell-check.mjs <base_url> <shot_dir>
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:5173";
const out = process.argv[3] ?? "tests/screenshots/bikenet";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const rect = (page, sel) => page.evaluate((s) => {
  const r = document.querySelector(s).getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) };
}, sel);

async function open(viewport, opts = {}) {
  const page = await browser.newPage({ viewport, ...opts });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${base}/2026/BoulderBikeNet`);
  await page.waitForSelector(".bbn-list li");
  return page;
}

// ---- Desktop: route mode with a long panel, then wheel the panel well past its end ----
const page = await open({ width: 1350, height: 840 });
await page.getByRole("tab", { name: "Your route" }).click();
await page.waitForSelector(".bbn-examples button:not([disabled])", { timeout: 20000 });
await page.locator(".bbn-examples button").first().click();
await page.waitForTimeout(800);
const map0 = await rect(page, ".bbn-mapwrap");
console.log("desktop map", map0, "| viewport 840");
await page.mouse.move(150, 500);
for (let i = 0; i < 15; i++) await page.mouse.wheel(0, 400);
await page.waitForTimeout(400);
const map1 = await rect(page, ".bbn-mapwrap");
const body = await page.evaluate(() => {
  const b = document.querySelector(".bbn-panel-body");
  return { scrollY: window.scrollY, panelScroll: b.scrollTop, panelMax: b.scrollHeight - b.clientHeight };
});
console.log("after panel wheel: map", map1, body, map1.top === map0.top && body.scrollY === 0 ? "OK map fixed" : "FAIL map moved");
await page.screenshot({ path: `${out}/shell-1-desktop-scrolled.png` });
for (let i = 0; i < 15; i++) await page.mouse.wheel(0, -400);
await page.waitForTimeout(300);
console.log("back up: panel scrollTop", await page.evaluate(() => document.querySelector(".bbn-panel-body").scrollTop));

// ---- Phone ----
const phone = await open({ width: 390, height: 844 }, { hasTouch: true, isMobile: true });
await phone.waitForTimeout(1200);
const sheet = () => rect(phone, ".bbn-panel");
console.log("phone map", await rect(phone, ".bbn-mapwrap"), "sheet (peek)", await sheet());
await phone.screenshot({ path: `${out}/shell-2-phone-peek.png` });
await phone.locator(".bbn-handle").click();
await phone.waitForTimeout(400);
console.log("tap -> half", await sheet());
await phone.screenshot({ path: `${out}/shell-3-phone-half.png` });
await phone.locator(".bbn-handle").click();
await phone.waitForTimeout(400);
console.log("tap -> full", await sheet());
await phone.screenshot({ path: `${out}/shell-4-phone-full.png` });

// Pick a list item from the full sheet: sheet drops to half and the map frames above it
await phone.locator(".bbn-list").first().locator("li button").first().click();
await phone.waitForTimeout(1500);
console.log("picked a rec -> sheet", await sheet(), "| photo card", await rect(phone, ".bbn-photo"));
await phone.screenshot({ path: `${out}/shell-5-phone-pick.png` });

// Drag the handle down to peek
const h = await phone.locator(".bbn-handle").boundingBox();
await phone.mouse.move(h.x + h.width / 2, h.y + 10);
await phone.mouse.down();
for (let y = h.y + 10; y < 780; y += 40) await phone.mouse.move(h.x + h.width / 2, y);
await phone.mouse.up();
await phone.waitForTimeout(400);
console.log("dragged down -> sheet", await sheet());

// Route mode on the phone: tab bumps peek to half; an example frames the route above the sheet
await phone.getByRole("tab", { name: "Your route" }).click();
await phone.waitForTimeout(300);
console.log("route tab -> sheet", await sheet());
await phone.waitForSelector(".bbn-examples button:not([disabled])", { timeout: 20000 });
await phone.locator(".bbn-examples button").first().click();
await phone.waitForTimeout(1500);
await phone.screenshot({ path: `${out}/shell-6-phone-route.png` });
console.log("attribution bottom", await rect(phone, ".leaflet-bottom.leaflet-right"), "| scrollY", await phone.evaluate(() => window.scrollY));

console.log("errors:", errors.length ? errors : "none");
await browser.close();
