import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { vi } from "vitest";

const EDITOR = path.join(import.meta.dirname, "../../../..");
// Where `task tools-core:build:wasm` writes each module.
const MODULES: Record<string, string> = {
  "stirling-tools.wasm": path.join(EDITOR, "public/wasm/stirling-tools.wasm"),
  "stirling-tools-proprietary.wasm": path.join(
    EDITOR,
    "src/proprietary/services/wasm/stirling-tools-proprietary.wasm",
  ),
};

/** Tests that run a module skip without it, as on a machine without Rust. */
export const toolsCoreWasmBuilt = existsSync(MODULES["stirling-tools.wasm"]);
export const proprietaryToolsWasmBuilt = existsSync(
  MODULES["stirling-tools-proprietary.wasm"],
);

/**
 * Serves the real PDFium and tools-core wasm to `fetch`, which jsdom cannot
 * load from the dev server. Undo with `vi.unstubAllGlobals()`.
 */
export async function stubWasmFetch(): Promise<void> {
  const read = async (file: string) => new Uint8Array(await readFile(file));
  const pdfium = await read(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
  const modules = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const [name, file] of Object.entries(MODULES)) {
    if (existsSync(file)) modules.set(name, await read(file));
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const name =
        new URL(String(url), "http://localhost").pathname.split("/").pop() ??
        "";
      return new Response(modules.get(name) ?? pdfium, {
        headers: { "Content-Type": "application/wasm" },
      });
    }),
  );
}
