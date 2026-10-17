import { chromium } from "playwright";
const url = process.argv[2] ?? "http://127.0.0.1:4181/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const requests = [];
page.on("request", (r) => requests.push(r.url()));
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(2500);
const initial = await page.evaluate(() => ({
  icons: document.querySelectorAll("svg").length,
  missing: [...document.querySelectorAll("[data-missing-icon]")].map((el) => el.getAttribute("data-missing-icon")),
}));
await page.keyboard.press("Escape");
await page.locator(".tool-picker-scrollable").hover();
await page.mouse.wheel(0, 1500);
await page.waitForTimeout(800);
const after = await page.evaluate(() => ({
  missing: [...document.querySelectorAll("[data-missing-icon]")].map((el) => el.getAttribute("data-missing-icon")),
}));
console.log(JSON.stringify({
  svgsAtLanding: initial.icons,
  missingAtLanding: initial.missing,
  missingAfterScroll: after.missing,
  iconChunkRequests: requests.filter((u) => /\/assets\/icons-/.test(u)),
  allChunkCount: requests.filter((u) => /\/assets\/.*\.js$/.test(u)).length,
}, null, 1));
await browser.close();
