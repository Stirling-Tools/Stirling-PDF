import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4180/";
const block = process.argv[3] ?? ""; // substring to abort, e.g. ".css"

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

if (block) {
  await page.route(
    (u) => u.href.includes(block),
    (route) => route.abort(),
  );
}

await page.addInitScript(() => {
  globalThis.__log = [];
  const snap = (why) => {
    const root = document.getElementById("root");
    const app = document.querySelector(".app-frame");
    globalThis.__log.push({
      t: Math.round(performance.now()),
      why,
      kids: root ? root.childElementCount : -1,
      len: root ? root.innerHTML.length : -1,
      frame: !!app,
      css: [...document.querySelectorAll('link[rel="stylesheet"]')].map(
        (l) => `${l.getAttribute("href")}${l.sheet ? "" : "!"}`,
      ),
    });
  };
  addEventListener("DOMContentLoaded", () => snap("domcontentloaded"));
  addEventListener("load", () => snap("load"));
  setInterval(() => snap("poll"), 25);
  const mo = new MutationObserver(() => snap("mut"));
  addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("root");
    if (root)
      mo.observe(root, { childList: true, subtree: true, characterData: true });
  });
});

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(1200);

const log = await page.evaluate(() => globalThis.__log);
// collapse consecutive identical signatures
const out = [];
for (const e of log) {
  const sig = `${e.kids}|${e.len}|${e.frame}|${e.css.join(",")}`;
  if (out.length && out[out.length - 1].sig === sig) continue;
  out.push({ ...e, sig });
}
console.log(
  out.map((e) => `${String(e.t).padStart(5)} ${e.why.padEnd(16)} kids=${e.kids} len=${String(e.len).padStart(7)} frame=${e.frame ? "Y" : "n"}`).join("\n"),
);
const last = out.find((e) => e.frame);
console.log("first frame at:", last ? last.t : "never");
console.log("css:", out[out.length - 1].css.join(" | "));
await browser.close();
