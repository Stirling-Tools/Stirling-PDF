import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4180/";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.addInitScript(() => {
  const t0 = performance.now();
  globalThis.__log = [];
  const snap = (tag) => {
    const root = document.getElementById("root");
    globalThis.__log.push({
      t: Math.round(performance.now() - t0),
      tag,
      kids: root ? root.childElementCount : -1,
      len: root ? root.innerHTML.length : -1,
      frame: !!document.querySelector(".app-frame"),
      pipelines: !!document.querySelector(".editor-pipelines"),
      html: root ? root.innerHTML.replace(/\s+/g, " ").slice(0, 200) : "",
    });
  };
  let last = "";
  setInterval(() => {
    const root = document.getElementById("root");
    const sig = `${root?.childElementCount}:${root?.innerHTML.length}:${!!document.querySelector(".app-frame")}`;
    if (sig !== last) {
      last = sig;
      snap("poll");
    }
  }, 15);
  new MutationObserver(() => snap("mo")).observe(document, {
    childList: true,
    subtree: true,
  });
  addEventListener("load", () => snap("load"));
});

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(2500);

const out = await page.evaluate(() => ({
  count: globalThis.__log?.length ?? -1,
  log: (globalThis.__log ?? []).slice(0, 24),
  finalFrame: !!document.querySelector(".app-frame"),
  finalLen: document.getElementById("root")?.innerHTML.length ?? -1,
}));
console.log(JSON.stringify(out, null, 1));
await browser.close();
