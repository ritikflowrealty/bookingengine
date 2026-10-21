// Screenshots pages at phone and desktop width for progress previews.
// Usage: [LOGIN_EMAIL=sales@flowrealty.in LOGIN_PASSWORD=flow@1234] node scripts/screenshots.mjs <outDir> [baseUrl] [path ...]
// A path may end with "#click=<css selector>" to click something before the shot.
import { chromium } from "playwright";

const [out = "screenshots", base = "http://localhost:3000", ...paths] = process.argv.slice(2);
const pages = paths.length ? paths : ["/", "/preview/cost-sheet"];
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const [name, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1440, height: 900 }]]) {
  const page = await browser.newPage({ viewport });
  if (process.env.LOGIN_EMAIL) {
    await page.goto(base + "/login");
    await page.fill('input[name="email"]', process.env.LOGIN_EMAIL);
    await page.fill('input[name="password"]', process.env.LOGIN_PASSWORD ?? "flow@1234");
    await Promise.all([page.waitForURL(/\/app/), page.click('button[type="submit"]')]);
  }
  for (const p of pages) {
    const [path, click] = p.split("#click=");
    await page.goto(base + path, { waitUntil: "networkidle" });
    if (click) {
      await page.click(click);
      await page.waitForTimeout(1500);
    }
    await page.locator("details").evaluateAll((els) => els.forEach((e) => (e.open = true)));
    const file = `${out}/${path.replace(/[/?=&]+/g, "_").replace(/^_|_$/g, "") || "home"}${click ? "-click" : ""}-${name}.png`;
    await page.screenshot({ path: file, fullPage: !click });
  }
  await page.close();
}
await browser.close();
