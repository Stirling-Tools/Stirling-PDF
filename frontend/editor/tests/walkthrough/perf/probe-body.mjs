import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4181/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(5000);
const state = await page.evaluate(() => ({
  elements: document.querySelectorAll("*").length,
  bodyText: document.body.innerText,
  rootText: document.getElementById("root")?.innerText?.slice(0, 300),
  appFrame: Boolean(document.querySelector(".app-frame")),
  pipelines: document.querySelector(".editor-pipelines__empty")?.textContent,
  hidden: [...document.querySelectorAll("*")]
    .filter((el) => el.checkVisibility && !el.checkVisibility())
    .length,
}));
console.log(JSON.stringify(state, null, 1).slice(0, 2500));
await browser.close();
