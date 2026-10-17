// Diagnostic: does the sidebar eye actually open the viewer inside the app?
// Prints the row's classes, the workbench bar's labels, canvas count and any
// console/page errors, so a wrong assumption is visible instead of fatal.
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:4181";
const PDF = new URL("../../../src/core/tests/test-fixtures/user-sample.pdf", import.meta.url).pathname;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`);
});

const state = async (label) => {
  const s = await page.evaluate(() => {
    const items = [...document.querySelectorAll(".file-sidebar-file-item")];
    const bar = document.querySelector(".workbench-bar");
    const eye = document.querySelector(".file-sidebar-file-item .file-sidebar-eye-btn");
    return {
      url: location.pathname + location.search,
      items: items.length,
      itemClasses: items.map((i) => i.className),
      bar: Boolean(bar),
      barViews: bar
        ? [...bar.querySelectorAll(".workbench-bar-view-label")].map((n) => (n.textContent ?? "").trim())
        : [],
      barLabels: bar
        ? [...bar.querySelectorAll("button[aria-label]")].map((b) => b.getAttribute("aria-label"))
        : [],
      canvases: document.querySelectorAll("canvas").length,
      surfaces: {
        toolbarDock: Boolean(document.querySelector(".pdf-viewer-toolbar-dock")),
        embedPdf: Boolean(document.querySelector(".embed-pdf-viewer")),
        embedTag: document.querySelectorAll("embed").length,
        iframe: document.querySelectorAll("iframe").length,
        workbench: Boolean(document.querySelector(".workbench")),
      },
      bodyClasses: [...new Set([...document.querySelectorAll("main *, #root > * > *")].slice(0, 400).map((n) => [...n.classList].join(".")).filter(Boolean))].slice(0, 40),
      eye: eye
        ? {
            pe: getComputedStyle(eye).pointerEvents,
            op: getComputedStyle(eye).opacity,
            box: eye.getBoundingClientRect().toJSON(),
            parentPe: getComputedStyle(eye.parentElement).pointerEvents,
          }
        : null,
    };
  });
  console.log(`[${label}]`, JSON.stringify(s));
};

await page.goto(`${BASE}/editor`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".tool-picker-scrollable", { state: "visible", timeout: 30000 });
await state("landing");

await page.locator('[data-testid="files-button"]').first().click({ timeout: 15000 });
await page.locator('[data-testid="file-input"]').setInputFiles(PDF);
await page.waitForSelector(".file-sidebar-file-item", { state: "visible", timeout: 30000 });
await state("uploaded");

await page.locator(".file-sidebar-file-item .file-sidebar-eye-btn").first().click({ timeout: 15000 });
await page.waitForTimeout(6000);
await state("after-eye-click");

await page.locator(".file-sidebar-file-item .file-sidebar-eye-btn").first().click({ timeout: 15000 });
await page.waitForTimeout(4000);
await state("after-second-eye-click");

console.log("[errors]", JSON.stringify(errors.slice(0, 8), null, 1));
await browser.close();
