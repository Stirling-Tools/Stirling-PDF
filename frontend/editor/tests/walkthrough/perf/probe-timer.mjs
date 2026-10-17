import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4180/";
const clamp = process.argv[3] === "clamp";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.addInitScript((doClamp) => {
  globalThis.__log = [];
  globalThis.__timers = [];
  if (doClamp) {
    const orig = globalThis.setTimeout.bind(globalThis);
    globalThis.setTimeout = (fn, d, ...args) => {
      if (typeof d === "number" && d > 250 && d < 400) {
        globalThis.__timers.push({ d, at: Math.round(performance.now()), stack: new Error().stack?.split("\n")[2]?.trim() });
        return orig(fn, 0, ...args);
      }
      return orig(fn, d, ...args);
    };
  }
  const snap = (why) => {
    const root = document.getElementById("root");
    globalThis.__log.push({
      t: Math.round(performance.now()),
      why,
      kids: root ? root.childElementCount : -1,
      len: root ? root.innerHTML.length : -1,
      frame: !!document.querySelector(".app-frame"),
      pipelines: !!document.querySelector(".editor-pipelines__empty"),
    });
  };
  addEventListener("DOMContentLoaded", () => snap("dcl"));
  addEventListener("load", () => snap("load"));
  setInterval(() => snap("poll"), 20);
  const mo = new MutationObserver(() => snap("mut"));
  addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("root");
    if (root) mo.observe(root, { childList: true, subtree: true, characterData: true });
  });
}, clamp);

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(1500);

const { log, timers } = await page.evaluate(() => ({
  log: globalThis.__log,
  timers: globalThis.__timers,
}));
const out = [];
for (const e of log) {
  const sig = `${e.kids}|${e.len}|${e.frame}|${e.pipelines}`;
  if (out.length && out[out.length - 1].sig === sig) continue;
  out.push({ ...e, sig });
}
console.log(out.map((e) => `${String(e.t).padStart(5)} ${e.why.padEnd(5)} kids=${e.kids} len=${String(e.len).padStart(7)} frame=${e.frame ? "Y" : "n"} pipelines=${e.pipelines ? "Y" : "n"}`).join("\n"));
if (clamp) console.log("clamped timers:", JSON.stringify(timers.slice(0, 3), null, 1));
await browser.close();
