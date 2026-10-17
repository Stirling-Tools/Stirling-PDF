/**
 * With the complete dictionary blocked, checks that every key the startup
 * subset claims to carry resolves to real text - so a subset gap shows up here
 * rather than as raw key text in the UI.
 *
 * Usage, from frontend/editor:
 *   node tests/walkthrough/perf/probe-subset-coverage.mjs http://127.0.0.1:4181/
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4181/";
const keys = JSON.parse(
  readFileSync("scripts/locale-startup-keys.json", "utf8"),
);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
let blocked = 0;
await page.route("**/translation.json", (route) => {
  blocked += 1;
  return route.abort();
});
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(4000);

const unresolved = await page.evaluate((all) => {
  const i18next = globalThis.i18next;
  if (!i18next) return { error: "no i18next on globalThis" };
  const missing = [];
  for (const key of all) {
    const value = i18next.t(key);
    // A key the subset lacks comes back as the key itself.
    if (value === key || value === `translation:${key}`) missing.push(key);
  }
  return { missing };
}, keys);

console.log(
  JSON.stringify(
    {
      keys: keys.length,
      blockedDictionaryRequests: blocked,
      unresolved: unresolved.error ? unresolved : unresolved.missing,
      unresolvedCount: unresolved.missing?.length ?? -1,
    },
    null,
    1,
  ),
);
await browser.close();
