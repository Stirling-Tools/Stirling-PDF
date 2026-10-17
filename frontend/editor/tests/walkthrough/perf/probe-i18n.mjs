import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4180/";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.addInitScript(() => {
  globalThis.__log = [];
  const t0 = performance.now();
  const push = (kind, detail) =>
    globalThis.__log.push({
      t: Math.round(performance.now() - t0),
      kind,
      detail,
    });
  globalThis.__push = push;

  let hooked = false;
  const poll = setInterval(() => {
    const i = globalThis.i18next;
    if (i && !hooked) {
      hooked = true;
      for (const ev of ["initialized", "loaded", "failedLoading", "languageChanged"])
        i.on(ev, (...a) =>
          push("i18next:" + ev, a.map((x) => String(x)).join(",").slice(0, 60)),
        );
      push("i18next:hooked", "");
    }
    const app = document.querySelector(".tool-picker-scrollable, .app-frame");
    push(
      "poll",
      JSON.stringify({
        i18n: i ? (i.isInitialized ? "init" : "pending") : "none",
        ns: i?.hasLoadedNamespace?.("translation") ?? null,
        lng: i?.language ?? null,
        app: !!app,
        rootKids: document.getElementById("root")?.childElementCount ?? -1,
      }),
    );
    if (performance.now() - t0 > 700) clearInterval(poll);
  }, 20);
});

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(1200);

const log = await page.evaluate(() => globalThis.__log);
// collapse consecutive identical polls
const out = [];
for (const e of log) {
  const prev = out[out.length - 1];
  if (e.kind === "poll" && prev?.kind === "poll" && prev.detail === e.detail) continue;
  out.push(e);
}
for (const e of out) console.log(String(e.t).padStart(5), e.kind.padEnd(22), e.detail.slice(0, 120));
await browser.close();
