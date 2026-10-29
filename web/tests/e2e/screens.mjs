// Screenshots and smoke checks at desktop and phone sizes.
// Run `npx vite preview --port 4173` first, then `npm run e2e [outdir]`.
import { createRequire } from "node:module";

// The pre-installed Playwright resolves through require (NODE_PATH), not ESM imports.
const { chromium } = createRequire(import.meta.url)("playwright");

const base = process.env.BASE ?? "http://localhost:4173/";
const out = process.argv[2] ?? "screens";
const shots = [
  ["desktop-final", { width: 1440, height: 1000 }, "#m=1426557"],
  ["desktop-head", { width: 1440, height: 1000 }, "#m=1426557&b=600&s=career"],
  ["laptop-head", { width: 1180, height: 820 }, "#m=1426557&b=600&s=career"],
  ["mobile-head", { width: 390, height: 844 }, "#m=1426557&b=600&s=career"],
];

const browser = await chromium.launch();
let failures = 0;
for (const [name, viewport, hash] of shots) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(base + hash);
  await page.waitForSelector(".contest");
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) errors.push(`horizontal overflow ${overflow}px`);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  if (errors.length) {
    failures++;
    console.log(name, errors);
  } else console.log(name, "ok");
  await page.close();
}
// Interactions: keyboard replay, wicket jump, profile drawer, dark mode.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: "dark", deviceScaleFactor: 2 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "#m=1426557&b=100");
  await page.waitForSelector(".contest");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(100);
  if (!page.url().includes("b=101")) errors.push(`ArrowRight did not advance: ${page.url()}`);
  await page.keyboard.press("]");
  const wicket = await page.locator(".last-ball.is-wicket").count();
  if (!wicket) errors.push("] did not land on a wicket");
  await page.screenshot({ path: `${out}/desktop-dark-wicket.png` });
  await page.locator(".contest .big-name").first().click();
  await page.waitForSelector(".drawer");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/desktop-dark-drawer.png` });
  await page.keyboard.press("Escape");
  if (await page.locator(".drawer").count()) errors.push("Escape did not close the drawer");
  console.log("interactions", errors.length ? errors : "ok");
  if (errors.length) failures++;
}
await browser.close();
process.exit(failures ? 1 : 0);
