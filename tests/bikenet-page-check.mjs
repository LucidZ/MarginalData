// Smoke test for /2026/BoulderBikeNet: network mode, a Fix gap's photo, route mode with an
// example and with dropped pins, phone layout. Records transferred bytes per data file.
//   node tests/bikenet-page-check.mjs <base_url> <shot_dir>
// e.g. node tests/bikenet-page-check.mjs http://localhost:5191 tests/screenshots/bikenet
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:5173";
const out = process.argv[3] ?? "tests/screenshots/bikenet";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const sizes = {};

async function open(viewport) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("response", async (r) => {
    const u = r.url();
    if (!u.includes("/data/boulder-bikenet/")) return;
    try {
      sizes[u.split("/").pop()] = { body: (await r.body()).length, encoding: r.headers()["content-encoding"] ?? "none" };
    } catch { /* body unavailable */ }
  });
  await page.goto(`${base}/2026/BoulderBikeNet`);
  await page.waitForSelector(".bbn-list li");
  return page;
}

// ---- Desktop ----
const page = await open({ width: 1400, height: 900 });
const header = await page.evaluate(() => document.querySelector("header")?.getBoundingClientRect().height);
const rootTop = await page.evaluate(() => document.querySelector(".bbn-root").getBoundingClientRect());
console.log(`header height ${header}px; app ${Math.round(rootTop.top)}..${Math.round(rootTop.bottom)} of 900`);
await page.waitForTimeout(1500); // tiles
await page.screenshot({ path: `${out}/1-network.png` });

await page.locator(".bbn-list").first().locator("li button").first().click();
await page.waitForSelector(".bbn-photo-img img, .bbn-photo-img:not(:has-text('Looking'))", { timeout: 15000 });
await page.waitForTimeout(1500);
console.log("photo panel:", (await page.locator(".bbn-photo-head b").textContent()), "|", (await page.locator(".bbn-photo-meta").textContent().catch(() => "no photo")));
await page.screenshot({ path: `${out}/2-fix-photo.png` });

console.log("selected list item:", await page.locator(".bbn-list li.bbn-sel").textContent());

// Advanced: other method + data version
await page.locator(".bbn-adv summary").click();
await page.getByLabel("Close the worst gaps").check();
await page.getByRole("button", { name: "Crashes", exact: true }).click();
await page.waitForTimeout(500);
console.log("fix list (crashes):", (await page.locator(".bbn-list").innerText()).replace(/\s+/g, " ").slice(0, 120));
await page.screenshot({ path: `${out}/3-advanced-fix-crashes.png` });
// Shared sidewalks: Fix isn't run, so picking it moves the method to Extend
await page.getByRole("button", { name: "+ Shared sidewalks" }).click();
await page.waitForTimeout(500);
console.log("shared: fix disabled", await page.getByLabel(/Close the worst gaps/).isDisabled(), "| list:",
  (await page.locator(".bbn-list").innerText()).replace(/\s+/g, " ").slice(0, 120));
await page.screenshot({ path: `${out}/3a-advanced-shared.png` });
await page.getByRole("button", { name: "Bike facilities only" }).click();

await page.getByRole("tab", { name: "Your route" }).click();
const t0 = Date.now();
await page.waitForSelector(".bbn-examples button:not([disabled])", { timeout: 20000 });
console.log(`graph ready ${Date.now() - t0} ms after opening route mode`);
await page.locator(".bbn-examples button").first().click();
await page.waitForSelector(".bbn-big");
await page.waitForTimeout(1200);
console.log("example route:", (await page.locator(".bbn-big").textContent()).trim());
console.log("compare:", (await page.locator(".bbn-table tbody").innerText()).replace(/\s+/g, " "));
await page.screenshot({ path: `${out}/4-route-example.png` });
const legend = async () => (await page.locator(".bbn-legend").innerText()).replace(/\s+/g, " ");
console.log("  legend (prefer road):", await legend());
await page.getByRole("button", { name: "The sidewalk" }).click();
await page.waitForTimeout(600);
console.log("  prefer sidewalk:", (await page.locator(".bbn-big").textContent()).trim(), "|", await legend());
console.log("  sidewalk note:", await page.locator(".bbn-legend + p").textContent().catch(() => "(none)"));
await page.screenshot({ path: `${out}/4a-route-prefer-sidewalk.png` });
await page.getByRole("button", { name: "The road" }).click();

// Search: address in From, place name in To
await page.getByRole("button", { name: "Clear route" }).click();
const from = page.getByPlaceholder("From: address or place");
await from.click();
const ts = Date.now();
await from.fill("1777 broad");
await page.waitForSelector(".bbn-results li");
console.log(`search "1777 broad" (${Date.now() - ts} ms):`, (await page.locator(".bbn-results").innerText()).replace(/\n/g, " | "));
await page.keyboard.press("Enter");
const to = page.getByPlaceholder("To: address or place");
await to.click();
await to.fill("norlin");
await page.waitForSelector(".bbn-results li");
console.log('search "norlin":', (await page.locator(".bbn-results").innerText()).replace(/\n/g, " | "));
await page.locator(".bbn-results li").first().click();
await page.waitForSelector(".bbn-big");
console.log("searched route:", (await page.locator(".bbn-big").textContent()).trim());
for (const q of ["pearl st", "king soopers", "cu", "29th st mall", "the hill", "newlands"]) {
  await to.fill(q);
  await page.waitForTimeout(150);
  console.log(`  "${q}":`, (await page.locator(".bbn-results").innerText().catch(() => "(none)")).replace(/\n/g, " | ").slice(0, 160));
}
await to.press("Escape");
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/4b-route-search.png` });

// Drop pins by clicking the map
await page.getByRole("button", { name: "Clear route" }).click();
const box = await page.locator(".bbn-map").boundingBox();
await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.35);
await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.65);
await page.waitForSelector(".bbn-big");
console.log("clicked pins route:", (await page.locator(".bbn-big").textContent()).trim(), "| labels:", await page.locator(".bbn-search input").evaluateAll((els) => els.map((e) => e.value)));
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/5-route-pins.png` });

// ---- Phone ----
const phone = await open({ width: 390, height: 844 });
await phone.waitForTimeout(1500);
await phone.screenshot({ path: `${out}/6-phone-network.png` });
await phone.getByRole("tab", { name: "Your route" }).click();
await phone.waitForSelector(".bbn-examples button:not([disabled])", { timeout: 20000 });
await phone.locator(".bbn-examples button").nth(1).click();
await phone.waitForSelector(".bbn-big");
await phone.waitForTimeout(1200);
await phone.screenshot({ path: `${out}/7-phone-route.png`, fullPage: true });
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
console.log(`phone horizontal overflow: ${overflow}px`);

console.log("data responses:", JSON.stringify(sizes));
console.log("errors:", errors.length ? errors : "none");
await browser.close();
