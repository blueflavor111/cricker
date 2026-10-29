// Pack dist/ into one HTML page plus data/, for hosts that want the page's
// CSS and JS inline (a claude.ai artifact). Run after `npm run build`:
//   node scripts/single-page.mjs out-dir
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const out = process.argv[2] ?? "dist-single";
const assets = readdirSync("dist/assets");
const read = (ext) => readFileSync(`dist/assets/${assets.find((f) => f.endsWith(ext))}`, "utf8");
const fonts = readFileSync("index.html", "utf8").match(/<link rel="stylesheet"[^>]+>/)[0];
mkdirSync(out, { recursive: true });
writeFileSync(
  `${out}/index.html`,
  `<title>Cricker Match Centre</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fonts}
<style>${read(".css")}</style>
<div id="app"></div>
<script type="module">${read(".js")}</script>
`,
);
cpSync("public/data", `${out}/data`, { recursive: true });
console.log(`Wrote ${out}/index.html and ${out}/data`);
