/**
 * Ad-hoc diagnostic (not part of the harness): loads the built page and reports
 * console messages, uncaught errors and what `#root` contains. Used to find out
 * why the prerender capture could not see `#root .app-frame`.
 *
 * Usage: node tests/walkthrough/perf/probe-render-errors.mjs [url]
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4181/";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1350, height: 940 } });
const messages = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") {
    messages.push(`console.${message.type()}: ${message.text()}`);
  }
});
page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));
page.on("requestfailed", (request) =>
  messages.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`),
);

await page.goto(url, { waitUntil: "load" });
let frameSeen = true;
try {
  await page.waitForSelector("#root .app-frame", {
    state: "visible",
    timeout: 30_000,
  });
} catch (error) {
  frameSeen = false;
  messages.push(`waitForSelector: ${error.message.split("\n")[0]}`);
}

const state = await page.evaluate(() => {
  const root = document.querySelector("#root");
  return {
    rootChildren: root ? root.children.length : -1,
    rootHtmlLength: root ? root.innerHTML.length : -1,
    bodyText: (document.body.innerText ?? "").slice(0, 200),
    scripts: [...document.querySelectorAll("script[src]")].length,
    appBar: Boolean(document.querySelector(".app-frame")),
  };
});

console.log(`app-frame visible: ${frameSeen}`);
console.log(JSON.stringify(state, null, 2));
for (const message of messages) console.log(message);
await browser.close();
