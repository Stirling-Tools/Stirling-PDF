import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4180/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.addInitScript(() => {
  globalThis.__log = [];
  const snap = (tag) => {
    globalThis.__log.push({
      t: Math.round(performance.now()),
      tag,
      imgs: [...document.images].map((i) => ({
        src: (i.currentSrc || i.src || "").replace(location.origin, ""),
        complete: i.complete,
        nw: i.naturalWidth,
        loading: i.getAttribute("loading"),
        fp: i.getAttribute("fetchpriority"),
        cls: i.className,
      })),
      links: [...document.querySelectorAll("link[rel=stylesheet]")].map((l) => ({
        href: l.href.replace(location.origin, ""),
        sheet: l.sheet !== null,
      })),
      fonts: document.fonts ? document.fonts.status : "n/a",
    });
  };
  // log every img created / src set
  const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  Object.defineProperty(HTMLImageElement.prototype, "src", {
    configurable: true,
    get() {
      return d.get.call(this);
    },
    set(v) {
      globalThis.__log.push({ t: Math.round(performance.now()), tag: "img.src", v: String(v) });
      return d.set.call(this, v);
    },
  });
  new MutationObserver(() => snap("mut")).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "href"],
  });
  setTimeout(() => snap("t60"), 60);
  setTimeout(() => snap("t200"), 200);
  setTimeout(() => snap("t420"), 420);
});

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(1200);
await page.screenshot({ path: "/private/var/folders/10/4hn925296yx_fqxp5g2z__v40000gn/T/opencode/lh-shot.png" });
console.log(JSON.stringify(await page.evaluate(() => globalThis.__log.slice(0, 40)), null, 1));
await browser.close();
