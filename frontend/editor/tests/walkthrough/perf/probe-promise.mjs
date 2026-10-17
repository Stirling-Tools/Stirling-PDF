import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4180/";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.addInitScript(() => {
  const t0 = performance.now();
  globalThis.__reg = [];
  globalThis.__fire = [];
  globalThis.__err = null;
  try {
    const origThen = Promise.prototype.then;
    Promise.prototype.then = function (onF, onR) {
      const at = performance.now() - t0;
      if (at < 220) {
        try {
          globalThis.__reg.push({
            at: Math.round(at),
            stack: new Error().stack.split("\n").slice(2, 5).join(" <- "),
          });
        } catch {}
      }
      const wrap = (fn) =>
        typeof fn === "function"
          ? function (v) {
              const dt = performance.now() - t0;
              if (dt < 1200)
                globalThis.__fire.push({
                  reg: Math.round(at),
                  dt: Math.round(dt),
                });
              return fn.call(this, v);
            }
          : fn;
      return origThen.call(this, wrap(onF), wrap(onR));
    };
    new MutationObserver(() => {
      try {
        globalThis.__fire.push({
          dom: Math.round(performance.now() - t0),
          frame: !!document.querySelector(".app-frame"),
        });
      } catch {}
    }).observe(document, { childList: true, subtree: true });
  } catch (e) {
    globalThis.__err = String(e);
  }
});

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(3000);

const out = await page.evaluate(() => {
  const uniq = [];
  const seen = new Set();
  for (const r of globalThis.__reg ?? []) {
    const k = r.stack.slice(0, 90);
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(r);
  }
  return {
    err: globalThis.__err,
    regCount: (globalThis.__reg ?? []).length,
    fireCount: (globalThis.__fire ?? []).length,
    regs: uniq.slice(0, 14),
    fires: (globalThis.__fire ?? []).slice(0, 30),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
