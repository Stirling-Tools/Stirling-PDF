/**
 * Verifies the startup subset alone is enough for the first screen: the
 * complete dictionary is blocked, so any key the subset lacks renders as raw
 * key text and shows up here.
 *
 * Usage, from frontend/editor:
 *   node tests/walkthrough/perf/probe-subset-only.mjs http://127.0.0.1:4181/ [settleMs]
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4181/";
const settleMs = Number(process.argv[3] ?? 4000);
const KEY_SHAPED = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+)+$/;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const blocked = [];
await page.route("**/translation.json", (route) => {
  blocked.push(route.request().url());
  return route.abort();
});

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(settleMs);

const readState = async (label) => {
  const state = await page.evaluate(
    (keyShapedSource) => {
      const keyShaped = new RegExp(keyShapedSource);
      const text = document.body?.innerText ?? "";
      const offenders = text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => keyShaped.test(line));
      return {
        elements: document.querySelectorAll("*").length,
        textLength: text.length,
        offenders: offenders.slice(0, 25),
        modal: document.querySelector('[role="dialog"]')?.innerText?.slice(0, 200) ?? null,
      };
    },
    KEY_SHAPED.source,
  );
  console.log(`--- ${label}`);
  console.log(JSON.stringify(state, null, 1));
  return state;
};

await readState("first screen, subset only");

// Walk the onboarding overlay if it offers a next button, so the keys its
// later steps resolve are covered too.
for (const label of ["next", "next-2", "next-3", "submit"]) {
  const button = page
    .locator(
      'button:visible:has-text("Next"), button:visible:has-text("Get started"), button:visible:has-text("Skip"), button:visible:has-text("Continue")',
    )
    .first();
  if (!(await button.count())) {
    console.log(`--- no "${label}" control`);
    break;
  }
  try {
    await button.click({ timeout: 2000 });
    await page.waitForTimeout(600);
    await readState(`after ${label}`);
  } catch (error) {
    console.log(`--- ${label} click failed: ${error.message.split("\n")[0]}`);
    break;
  }
}

console.log(`--- blocked dictionary requests: ${blocked.length}`);
for (const entry of blocked) console.log(entry);
await browser.close();
