/**
 * Records the translation keys the landing screen actually resolves, so the
 * startup subset can be derived from evidence rather than guessed. Hooks the
 * i18next instance as soon as the app assigns it to globalThis, then wraps `t`
 * and `getFixedT` (react-i18next resolves keys through the latter).
 *
 * Usage, from frontend/editor:
 *   node tests/walkthrough/perf/probe-keys.mjs http://127.0.0.1:4181/ [out.json] [settleMs]
 *
 * Writes the recorded key list plus the DOM text it saw; the caller decides
 * which keys belong in the subset.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4181/";
const out = process.argv[3];
const settleMs = Number(process.argv[4] ?? 5000);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.addInitScript(() => {
  const keys = new Set();
  globalThis.__i18nKeys = keys;
  Object.defineProperty(globalThis, "i18next", {
    configurable: true,
    set(instance) {
      // Back to a plain property so later assignments behave normally.
      delete globalThis.i18next;
      globalThis.i18next = instance;
      const record = (key) => {
        if (typeof key === "string") keys.add(key);
        else if (Array.isArray(key)) for (const k of key) record(k);
      };
      const t = instance.t.bind(instance);
      instance.t = function (...args) {
        record(args[0]);
        return t(...args);
      };
      const getFixedT = instance.getFixedT.bind(instance);
      instance.getFixedT = function (...args) {
        const fixed = getFixedT(...args);
        return function (...callArgs) {
          record(callArgs[0]);
          return fixed(...callArgs);
        };
      };
    },
  });
});

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(settleMs);

// Interactions the landing screen offers without a document: they exercise
// menus, tooltips and labels that the first paint alone does not touch.
const interactions = [
  async () => page.hover("body"),
  async () => page.keyboard.press("Tab"),
  async () => {
    const button = page.locator("button:visible").first();
    if (await button.count()) await button.hover();
  },
];
for (const act of interactions) {
  try {
    await act();
    await page.waitForTimeout(600);
  } catch {
    /* the landing screen may not offer this control */
  }
}
await page.waitForTimeout(800);

const result = await page.evaluate(() => {
  const text = document.body?.innerText ?? "";
  const keyShaped = text
    .split("\n")
    .filter((line) => /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+)+$/.test(line.trim()));
  return {
    language: globalThis.i18next?.language,
    keyCount: globalThis.__i18nKeys ? globalThis.__i18nKeys.size : -1,
    keys: globalThis.__i18nKeys ? [...globalThis.__i18nKeys].sort() : [],
    keyShapedText: keyShaped.slice(0, 20),
    bodyLength: text.length,
  };
});

console.log(
  JSON.stringify(
    {
      language: result.language,
      keyCount: result.keyCount,
      keyShapedText: result.keyShapedText,
      bodyLength: result.bodyLength,
    },
    null,
    1,
  ),
);
if (out) {
  writeFileSync(out, `${JSON.stringify(result.keys, null, 0)}\n`);
  console.log(`keys -> ${out}`);
}
await browser.close();
