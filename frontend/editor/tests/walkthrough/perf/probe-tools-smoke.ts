/**
 * Ad-hoc dist-level smoke (untracked, not part of the harness): opens a set of
 * tools against the built bundle with the harness API stubs installed, and
 * records, per tool, the `vendor-mantine-*` chunks the tool pulled in, whether
 * the tool panel rendered, and any page errors. Evidence that the tool-only
 * families load on demand and that no tool fails to initialise.
 *
 * Usage: npx tsx tests/walkthrough/perf/probe-tools-smoke.ts [baseUrl]
 */
import { chromium } from "playwright";
import {
  bypassOnboarding,
  fulfillUnstubbedApis,
  mockAppApis,
  seedCookieConsent,
} from "@app/tests/helpers/api-stubs";

const baseUrl = process.argv[2] ?? "http://localhost:4181";

const TOOLS = [
  "replaceColor",
  "compress",
  "split",
  "removeBlanks",
  "getPdfInfo",
  "annotate",
  "addWatermark",
  "formFill",
  "adjustContrast",
  "pageLayout",
  "extractImages",
  "addAttachments",
  "changeMetadata",
  "redact",
  "pdfTextEditor",
  "addStamp",
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await fulfillUnstubbedApis(context);
const page = await context.newPage();
await seedCookieConsent(page);
await bypassOnboarding(page);
await mockAppApis(page, {});
await seedCookieConsent(page);

let failures = 0;
for (const id of TOOLS) {
  const errors: string[] = [];
  const onPageError = (error: Error) => errors.push(error.message);
  const onConsole = (message: { type: () => string; text: () => string }) => {
    if (message.type() === "error") errors.push(message.text());
  };
  page.on("pageerror", onPageError);
  page.on("console", onConsole);
  const started = Date.now();
  await page.goto(`${baseUrl}/editor?tool=${id}`, { waitUntil: "load" });
  let rendered = true;
  try {
    await page.waitForSelector(".tool-panel", { state: "visible", timeout: 20_000 });
  } catch {
    rendered = false;
  }
  const msToPanel = Date.now() - started;
  const { chunks, bytes } = await page.evaluate(() => {
    const entries = performance
      .getEntriesByType("resource")
      .filter((entry) => entry.name.includes("vendor-mantine-"));
    return {
      chunks: entries.map((entry) => entry.name).sort(),
      bytes: entries.reduce((total, entry) => total + (entry.encodedBodySize || 0), 0),
    };
  });
  console.log(
    `${rendered ? "ok  " : "FAIL"} ${id.padEnd(16)} ${String(msToPanel).padStart(5)}ms chunks=${chunks.length} encoded=${bytes}B ${
      chunks.map((name) => (name.split("/").pop() ?? name).replace("vendor-mantine-", "").replace(/-[A-Za-z0-9_-]{8}\.js$/, "")).join(",")
    }`,
  );
  if (!rendered || errors.length > 0) {
    failures += 1;
    for (const error of errors) console.log(`      error: ${error.slice(0, 200)}`);
  }
  page.off("pageerror", onPageError);
  page.off("console", onConsole);
}
console.log(`failures: ${failures}/${TOOLS.length}`);
await browser.close();
