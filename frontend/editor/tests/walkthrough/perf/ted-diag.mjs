// One-off diagnostic: why does /pdf-text-editor never report firstPageRendered
// against the built dist + stubbed API? Mirrors text-editor-cycle.ts steps.
import { resolve } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:4181";
const DOC = resolve(
  import.meta.dirname,
  "../../../src/core/tests/test-fixtures/user-sample.pdf",
);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const log = [];
page.on("console", (m) =>
  log.push(`console.${m.type()}: ${m.text().slice(0, 300)}`),
);
page.on("pageerror", (e) => log.push(`pageerror: ${String(e).slice(0, 300)}`));
page.on("requestfailed", (r) =>
  log.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ""}`),
);
page.on("response", (r) => {
  const u = r.url();
  if (u.includes("/api/")) log.push(`api ${r.status()} ${u}`);
  if (r.status() >= 400) log.push(`http ${r.status()} ${u}`);
});

await page.goto(`${BASE}/pdf-text-editor`, { waitUntil: "domcontentloaded" });
await page.getByTestId("pdf-editor-root").waitFor({ state: "visible", timeout: 60_000 });
log.push("root visible");
await page.getByTestId("pdf-editor-file-input").setInputFiles(DOC);
log.push("file set");

const read = () =>
  page.evaluate(() => {
    const w = window;
    const s = w.__editor_store;
    if (!s) return { store: null };
    const st = s.state ?? s.getState?.() ?? {};
    return {
      storeKeys: Object.keys(s).slice(0, 20),
      hasDocument: st.hasDocument,
      pageCount: st.pageCount,
      pages: Array.isArray(st.pages) ? st.pages.length : st.pages,
      loading: st.loading,
      firstPageRendered: st.firstPageRendered,
      progress: st.progress,
      error: st.error,
      passwordPrompt: st.passwordPrompt,
      bodyText: (document.body.innerText ?? "").slice(0, 400),
      canvases: document.querySelectorAll("canvas").length,
      hasRenderedFlag: "__editor_store" in w,
    };
  });

for (let i = 0; i < 12; i += 1) {
  await new Promise((r) => setTimeout(r, 2500));
  const snap = await read();
  console.log(`--- t=${(i + 1) * 2.5}s`, JSON.stringify(snap));
  if (snap.firstPageRendered && !snap.loading) break;
}

console.log("=== events ===");
console.log(log.slice(0, 60).join("\n"));
await browser.close();
