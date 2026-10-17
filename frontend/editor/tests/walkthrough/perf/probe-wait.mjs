import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4180/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.addInitScript(() => {
  globalThis.__log = [];
  const t0 = performance.now();
  const rec = (kind, detail) => {
    if (globalThis.__log.length < 400)
      globalThis.__log.push({
        t: Math.round(performance.now() - t0),
        kind,
        detail,
      });
  };
  globalThis.__t0 = t0;
  globalThis.__rec = rec;

  const st = window.setTimeout;
  window.setTimeout = function (fn, delay, ...rest) {
    if (typeof delay === "number" && delay >= 80)
      rec("setTimeout", `${Math.round(delay)}ms :: ${(new Error().stack || "").split("\n")[2]?.trim().slice(0, 90)}`);
    return st.call(this, fn, delay, ...rest);
  };
  const si = window.setInterval;
  window.setInterval = function (fn, delay, ...rest) {
    if (typeof delay === "number" && delay >= 80)
      rec("setInterval", `${Math.round(delay)}ms`);
    return si.call(this, fn, delay, ...rest);
  };
  const of = window.fetch;
  window.fetch = function (input, init) {
    const u = typeof input === "string" ? input : input?.url;
    rec("fetch", String(u).slice(-60));
    return of.call(this, input, init);
  };
  const xo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u, ...r) {
    rec("xhr", `${m} ${String(u).slice(-50)}`);
    return xo.call(this, m, u, ...r);
  };
  addEventListener("DOMContentLoaded", () => {
    rec("dom", "contentloaded");
    const root = document.getElementById("root");
    if (root) {
      const mo = new MutationObserver(() => {
        rec(
          "dom",
          `root children=${root.children.length} text=${(root.textContent || "").slice(0, 30)}`,
        );
      });
      mo.observe(root, { childList: true, subtree: true, characterData: true });
    }
    document.fonts?.ready?.then?.(() => rec("fonts", "ready"));
    for (const n of ["DOMInteractive", "load"]) {
      const e = performance.getEntriesByName(n)[0];
      if (e) rec("nav", `${n} ${Math.round(e.startTime)}`);
    }
  });
  addEventListener("load", () => rec("nav", "load"));
});

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(3000);
const log = await page.evaluate(() => globalThis.__log);
for (const e of log) console.log(`${String(e.t).padStart(5)}ms  ${e.kind.padEnd(12)} ${e.detail}`);
await browser.close();
