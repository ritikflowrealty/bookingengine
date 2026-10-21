// End-to-end smoke test of the customer booking flow + staff follow-up, against a demo-mode server.
// Usage: node scripts/e2e-booking.mjs <outDir> [baseUrl] [projectSlug] [width]
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const [out = "e2e", base = "http://localhost:3000", slug = "sipani-city", width = "1440"] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 } });
const shot = async (name) => page.screenshot({ path: `${out}/${slug}-${width}-${name}.png`, fullPage: false });
const step = (m) => console.log("•", m);

await page.goto(`${base}/p/${slug}/book`);
await shot("1-login");
await page.fill('input[autocomplete="tel-national"]', process.env.E2E_PHONE ?? "9999900001");
await page.click('button[type="submit"]');
await page.waitForSelector("text=Demo mode · your code is");
const code = (await page.locator("b.tracking-widest").textContent()).trim();
await page.fill('input[autocomplete="one-time-code"]', code);
await shot("2-otp");
await page.click('button[type="submit"]');
await page.waitForSelector("text=choose your");
step("signed in with OTP");
await page.waitForTimeout(2500);
await shot("3-picker");
await page.click(`button:has-text("${slug === "the-riverine" ? "List" : "Floors"}")`);
const green = page.locator('button[aria-label*="Available"]').first();
const label = await green.getAttribute("aria-label");
await green.click();
await page.waitForSelector("text=Reserve & pay");
await page.waitForTimeout(500);
await shot("4-quote");
step(`picked ${label}`);
await page.click("text=Reserve & pay");
await page.waitForSelector("text=is reserved for you");
await shot("5-reserved");
await page.click("text=Pay with UPI, card or net banking");
await page.click("text=(simulated)");
await page.waitForSelector("text=Booking form");
step("token paid (demo gateway)");
await page.fill('input[name="fullName"]', "Demo Customer");
await page.fill('input[name="email"]', "demo.customer@example.com");
await page.fill('input[name="dateOfBirth"]', "1990-01-15");
await page.fill('input[name="pan"]', "ABCDE1234F");
await page.fill('input[name="occupation"]', "Engineer");
await page.fill('input[name="address"]', "12, Demo Layout, Whitefield");
await page.fill('input[name="city"]', "Bengaluru");
await page.fill('input[name="pincode"]', "560066");
await page.check('input[name="consent"]');
await shot("6-form");
await page.click("text=Submit booking form");
await page.waitForSelector("text=Upload KYC documents");
step("booking form submitted");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
writeFileSync(`${out}/kyc.png`, png);
for (const doc of ["PAN card", "Aadhaar", "Photograph"]) {
  await page.locator(`label:has-text("${doc}") input[type=file]`).setInputFiles(`${out}/kyc.png`);
  await page.waitForTimeout(1500);
}
await page.waitForSelector("text=Congratulations");
await shot("7-done");
step("KYC uploaded → booking complete for customer");

const staff = await browser.newPage({ viewport: { width: Number(width), height: 900 } });
await staff.goto(`${base}/login`);
await staff.fill('input[name="email"]', "sales@flowrealty.in");
await staff.fill('input[name="password"]', "flow@1234");
await Promise.all([staff.waitForURL(/\/app/), staff.click('button[type="submit"]')]);
await staff.goto(`${base}/app/bookings`);
await staff.locator("table a").first().click();
await staff.waitForSelector("text=Frozen cost sheet");
for (let i = 0; i < 3; i++) {
  await staff.locator('button:text-is("Verify")').first().click();
  await staff.waitForTimeout(2000);
}
await staff.reload();
await staff.screenshot({ path: `${out}/${slug}-${width}-7b-staff-kyc.png`, fullPage: true });
await staff.click("text=Confirm booking");
await staff.waitForSelector("text=Booking confirmed");
await staff.reload();
await staff.screenshot({ path: `${out}/${slug}-${width}-8-staff-booking.png`, fullPage: true });
step("staff verified KYC and confirmed the booking");
await browser.close();
