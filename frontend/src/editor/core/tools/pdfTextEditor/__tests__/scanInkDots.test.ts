// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));

import { measureScanInk } from "@editor/tools/pdfTextEditor/pdfium/BackgroundSampler";
import { isScanRun } from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import { buildScan } from "@editor/tools/pdfTextEditor/__tests__/scanFixtures";

beforeAll(async () => {
  const wasmPath = createRequire(import.meta.url).resolve(
    "@embedpdf/pdfium/pdfium.wasm",
  );
  const wasmBytes = await readFile(wasmPath);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Promise.resolve(
        new Response(wasmBytes, {
          headers: { "Content-Type": "application/wasm" },
        }),
      ),
    ),
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

test("a word with no ascender still takes its i-dots into the cover box", async () => {
  const size = 12;
  const { doc, page } = await buildScan(
    [{ family: "Times-Roman", text: "mice in vain", size }],
    { dpi: 200, blur: 0.5, noise: 6 },
  );
  try {
    const run = page.runs.find(isScanRun)!;
    const baseline = run.matrix.f;
    const span = { x0: run.bounds.x, x1: run.bounds.x + run.bounds.width };
    // An OCR box that stops at the x-height, as it does for such a word.
    const tight = measureScanInk(doc.module, page, {
      ...span,
      bottom: baseline - 0.5,
      top: baseline + size * 0.47,
    })!;
    const tall = measureScanInk(doc.module, page, {
      ...span,
      bottom: baseline - 0.5,
      top: baseline + size * 0.8,
    })!;
    const top = (ink: typeof tight) => ink.rect.y + ink.rect.height;

    // The dots sit about a fifth of the size above the x-height.
    expect(top(tall) - baseline).toBeGreaterThan(size * 0.6);
    expect(top(tight)).toBeCloseTo(top(tall), 0);
    // What the letters measure is unchanged by the taller cover.
    expect(tight.body.height).toBeLessThan(size * 0.55);
  } finally {
    doc.dispose();
  }
});
