// Screenshots and smoke checks at desktop and phone sizes.
// Run `npx vite preview --port 4173` first, then `npm run e2e [outdir]`.
import { createRequire } from "node:module";

// The pre-installed Playwright resolves through require (NODE_PATH), not ESM imports.
const { chromium } = createRequire(import.meta.url)("playwright");

const base = process.env.BASE ?? "http://localhost:4173/";
const out = process.argv[2] ?? "screens";
// 57.4 overs of Australia's first innings at the Gabba: Smith v Siraj.
const at = "#m=1426557&b=351&s=career";
const shots = [
  ["w1440", { width: 1440, height: 1000 }, at],
  ["w1024", { width: 1024, height: 900 }, at],
  ["w768", { width: 768, height: 1000 }, at],
  ["w390", { width: 390, height: 844 }, at],
  ["w1440-final", { width: 1440, height: 1000 }, "#m=1426557"],
  ["w390-final", { width: 390, height: 844 }, "#m=1426557"],
];

// Key figures must fit their boxes: nothing clipped or spilling into a neighbour.
const clipped = () =>
  [...document.querySelectorAll(".figs-1 > div, .figs-2 > div, .cmp-figs > div, .mh-line1, .mh-book, .ct-p, .pb-inner")]
    .filter((el) => el.scrollWidth > el.clientWidth + 1)
    .map((el) => el.className);

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
  const bad = await page.evaluate(clipped);
  if (bad.length) errors.push(`clipped: ${bad.join(", ")}`);
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
  const wicket = await page.locator(".mh-last.is-wicket").count();
  if (!wicket) errors.push("] did not land on a wicket");
  await page.screenshot({ path: `${out}/desktop-dark-wicket.png` });
  await page.locator(".contest .ct-name").first().click();
  await page.waitForSelector(".drawer");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/desktop-dark-drawer.png` });
  await page.keyboard.press("Escape");
  if (await page.locator(".drawer").count()) errors.push("Escape did not close the drawer");
  console.log("interactions", errors.length ? errors : "ok");
  if (errors.length) failures++;
}
// Window controls and print.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  await page.goto(base + at);
  await page.waitForSelector(".contest");
  await page.locator(".seg button", { hasText: "This series" }).click();
  await page.waitForTimeout(200);
  if (!page.url().includes("s=series")) errors.push("segmented control did not switch window");
  await page.locator(".ct-other select").selectOption("venue");
  await page.waitForTimeout(200);
  if (!page.url().includes("s=venue")) errors.push("window selector did not switch");
  if (!(await page.locator(".mt tr.is-selected").count())) errors.push("matchup table has no selected row");
  await page.locator(".tabs button", { hasText: "Ball by ball" }).click();
  if (!(await page.locator(".ball-log li").count())) errors.push("ball log empty");
  console.log("controls", errors.length ? errors : "ok");
  if (errors.length) failures++;
  await page.close();
}
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(base + at);
  await page.waitForSelector(".contest");
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: `${out}/print.pdf`, format: "A4", landscape: true, printBackground: true });
  await page.setViewportSize({ width: 1086, height: 760 });
  await page.screenshot({ path: `${out}/print-preview.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) console.log("print", [`horizontal overflow ${overflow}px`]), failures++;
  else console.log("print ok");
}
await browser.close();
process.exit(failures ? 1 : 0);
