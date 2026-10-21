// Screenshots every page at phone and desktop width for progress previews.
// Usage: node scripts/screenshots.mjs <outDir> [baseUrl] [path ...]
import { chromium } from "playwright";

const [out = "screenshots", base = "http://localhost:3000", ...paths] = process.argv.slice(2);
const pages = paths.length ? paths : ["/", "/preview/cost-sheet"];
const browser = await chromium.launch();
for (const [name, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1440, height: 900 }]]) {
  const page = await browser.newPage({ viewport });
  for (const p of pages) {
    await page.goto(base + p, { waitUntil: "networkidle" });
    await page.locator("details").evaluateAll((els) => els.forEach((e) => (e.open = true)));
    await page.screenshot({ path: `${out}/${(p.replaceAll("/", "_") || "_").replace(/^_/, "") || "home"}-${name}.png`, fullPage: true });
  }
  await page.close();
}
await browser.close();
