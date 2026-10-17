// Names the module behind the first dynamic import by logging every
// <link rel=modulepreload> / <script src> the preload helper inserts, with the
// stack that inserted it.
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4180/";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.addInitScript(() => {
  const t0 = performance.now();
  globalThis.__ins = [];
  const note = (node) => {
    try {
      const tag = node?.tagName;
      if (tag !== "LINK" && tag !== "SCRIPT") return;
      const rel = node.getAttribute?.("rel");
      const href = node.getAttribute?.("href") ?? node.getAttribute?.("src") ?? "";
      if (tag === "LINK" && rel !== "modulepreload" && rel !== "preload") return;
      globalThis.__ins.push({
        t: Math.round(performance.now() - t0),
        tag,
        rel: rel ?? "",
        href: String(href).split("/").slice(-1)[0],
        stack: new Error().stack.split("\n").slice(2, 6).join(" <- "),
      });
    } catch {}
  };
  const ap = Node.prototype.appendChild;
  Node.prototype.appendChild = function (n) {
    note(n);
    return ap.call(this, n);
  };
  const ib = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (n, ref) {
    note(n);
    return ib.call(this, n, ref);
  };
});

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(2500);

const out = await page.evaluate(() => (globalThis.__ins ?? []).slice(0, 12));
console.log(JSON.stringify(out, null, 1));
await browser.close();
