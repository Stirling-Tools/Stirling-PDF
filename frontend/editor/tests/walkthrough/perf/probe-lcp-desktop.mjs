/**
 * Desktop-shaped LCP attribution: Lighthouse's desktop preset does not throttle
 * the browser, so the 782 ms / 1226 ms split has to be observed unthrottled.
 * Prints the LCP candidate (tag, class, text) and the shell/React state at the
 * moment each candidate is reported, once per run.
 *
 * node tests/walkthrough/perf/probe-lcp-desktop.mjs [url] [runs]
 */
import { chromium } from "playwright";

const url =
  process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:4181/";
const runs = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 5);

const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  for (let run = 1; run <= runs; run += 1) {
    const context = await browser.newContext({ viewport: { width: 1350, height: 940 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__events = [];
      const snap = () => ({
        shellFrame: Boolean(document.querySelector("[data-shell-frame]")),
        rootChildren: (document.getElementById("root")?.children.length) ?? 0,
      });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const el = entry.element;
          window.__events.push({
            kind: entry.entryType,
            name: entry.name,
            time: Math.round(entry.startTime),
            size: entry.size ?? null,
            tag: el ? el.tagName : null,
            cls: el ? (el.className || "").toString().slice(0, 60) : null,
            text: el ? (el.textContent || "").trim().slice(0, 40) : null,
            ...snap(),
          });
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
    });
    await page.goto(url, { waitUntil: "load" });
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          let quiet = 0;
          const tick = () => {
            quiet += 1;
            if (quiet > 6) resolve();
            else requestAnimationFrame(tick);
          };
          setTimeout(tick, 1200);
        }),
    );
    const events = await page.evaluate(() => window.__events);
    const last = events[events.length - 1];
    console.log(
      `run ${run}: lcp=${last?.time} tag=${last?.tag} cls="${last?.cls}" text="${last?.text}" size=${last?.size} shellFrame=${last?.shellFrame} rootChildren=${last?.rootChildren} candidates=${events.length}`,
    );
    console.log(
      "  " +
        events
          .map((e) => `${e.time}ms ${e.tag}${e.cls ? "." + e.cls.split(" ")[0] : ""}`)
          .join(" | "),
    );
    await context.close();
  }
} finally {
  await browser.close();
}
