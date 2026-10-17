import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4180/";
const locale = process.argv[3];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage(locale ? { locale } : {});
page.on("request", (r) => {
  if (r.url().includes("locales") || r.url().includes("translation"))
    console.log(`REQ   ${r.url()} ${r.resourceType()}`);
});
page.on("response", (r) => {
  if (r.url().includes("locales") || r.url().includes("translation"))
    console.log(`RESP  ${r.status()} ${r.headers()["content-encoding"] ?? "-"} ${r.url()}`);
});
page.on("requestfailed", (r) => {
  if (r.url().includes("locales")) console.log(`FAIL  ${r.failure()?.errorText} ${r.url()}`);
});
page.on("console", (m) => console.log(`CONSOLE ${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => console.log(`PAGEERROR ${e.message}`));

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(3000);
const state = await page.evaluate(async () => {
  const flatten = (obj, prefix = "", out = []) => {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, path, out);
      else if (typeof v === "string") out.push(path);
    }
    return out;
  };
  const source = await fetch("locales/en-US/translation.json").then((r) => r.json());
  const keys = flatten(source);
  let missing = 0;
  for (let i = 0; i < keys.length; i += 37) {
    if (globalThis.i18next.t(keys[i]) === keys[i]) missing += 1;
  }
  return {
    lng: globalThis.i18next?.language,
    initialized: globalThis.i18next?.isInitialized,
    hasNs: globalThis.i18next?.hasLoadedNamespace?.("translation"),
    preloads: [...document.querySelectorAll('link[rel="preload"]')].map((l) => l.getAttribute("href")),
    entries: performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((n) => n.includes("locales")),
    sampledKeys: Math.ceil(keys.length / 37),
    missingKeys: missing,
    sourceKeys: keys.length,
  };
});
console.log(JSON.stringify(state, null, 1));
await browser.close();
