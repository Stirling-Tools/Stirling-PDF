import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { vi } from "vitest";

const TOOLS_CORE_WASM = path.join(
  import.meta.dirname,
  "../../../../public/wasm/stirling-tools.wasm",
);

/** Built by `task tools-core:build:wasm`; tests that run it skip without it. */
export const toolsCoreWasmBuilt = existsSync(TOOLS_CORE_WASM);

/**
 * Serves the real PDFium and tools-core wasm to `fetch`, which jsdom cannot
 * load from the dev server. Undo with `vi.unstubAllGlobals()`.
 */
export async function stubWasmFetch(): Promise<void> {
  const pdfium = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
  const tools = await readFile(TOOLS_CORE_WASM);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string | URL) =>
        new Response(
          String(url).endsWith("stirling-tools.wasm") ? tools : pdfium,
          { headers: { "Content-Type": "application/wasm" } },
        ),
    ),
  );
}
