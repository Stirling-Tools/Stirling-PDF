/**
 * Contract for the desktop page rasterizer: it hands the path to the Tauri
 * command, turns the PNG bytes into a data URL the thumbnail cache can store,
 * and reports null (caller falls back to the engine) when the shell or the
 * render is unavailable.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { expectConsole } from "@app/tests/failOnConsole";

const mocks = vi.hoisted(() => ({
  invokes: [] as Array<{ command: string; args: Record<string, unknown> }>,
  result: null as ArrayBuffer | Error | null,
  tauri: true,
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => mocks.tauri,
  invoke: async (command: string, args: Record<string, unknown>) => {
    mocks.invokes.push({ command, args });
    if (mocks.result instanceof Error) throw mocks.result;
    return mocks.result;
  },
}));

import {
  NATIVE_THUMBNAIL_WIDTH,
  canRenderNativeThumbnails,
  renderNativeDocumentInfo,
  renderNativePdfPageBlob,
  renderNativePdfRect,
  renderNativeThumbnail,
} from "@app/services/nativePdfRender";

describe("nativePdfRender (desktop)", () => {
  beforeEach(() => {
    mocks.invokes.length = 0;
    mocks.result = null;
    mocks.tauri = true;
  });

  test("is on for desktop builds", () => {
    expect(canRenderNativeThumbnails).toBe(true);
    expect(NATIVE_THUMBNAIL_WIDTH).toBe(240);
  });

  test("renders through the Tauri command and returns a JPEG data URL", async () => {
    mocks.result = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
    await expect(renderNativeThumbnail("/tmp/a.pdf", 1, 240)).resolves.toBe(
      "data:image/jpeg;base64,iVBORw==",
    );
    expect(mocks.invokes).toEqual([
      {
        command: "render_pdf_page_thumbnail",
        args: { path: "/tmp/a.pdf", page: 1, maxWidth: 240 },
      },
    ]);
  });

  test("encodes rasters larger than one base64 chunk", async () => {
    const size = 0x2000 * 2 + 3;
    const bytes = new Uint8Array(size);
    for (let index = 0; index < size; index += 1) bytes[index] = index % 251;

    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);

    mocks.result = bytes.buffer;
    await expect(renderNativeThumbnail("/tmp/big.pdf", 2, 240)).resolves.toBe(
      `data:image/jpeg;base64,${btoa(binary)}`,
    );
  });

  test("renders a tile through the Tauri command", async () => {
    mocks.result = new Uint8Array([1, 2, 3]).buffer;
    const rect = { page: 3, x: 10, y: 20, width: 300, height: 400, scale: 2 };
    await expect(renderNativePdfRect("/tmp/a.pdf", rect)).resolves.toBe(
      "data:image/jpeg;base64,AQID",
    );
    expect(mocks.invokes).toEqual([
      {
        command: "render_pdf_rect",
        args: { path: "/tmp/a.pdf", ...rect },
      },
    ]);
  });

  test("hands the first-paint poster a JPEG Blob", async () => {
    mocks.result = new Uint8Array([9, 8, 7]).buffer;
    const blob = await renderNativePdfPageBlob("/tmp/a.pdf", 1, 1200);
    expect(blob?.type).toBe("image/jpeg");
    expect(blob?.size).toBe(3);
    expect(mocks.invokes).toEqual([
      {
        command: "render_pdf_page_thumbnail",
        args: { path: "/tmp/a.pdf", page: 1, maxWidth: 1200 },
      },
    ]);
  });

  test("returns the document info the engine reports", async () => {
    const info = { pageCount: 3, pages: [{ width: 612, height: 792, rotation: 90 }] };
    mocks.result = info as never;
    await expect(renderNativeDocumentInfo("/tmp/a.pdf")).resolves.toEqual(info);
    expect(mocks.invokes).toEqual([
      { command: "pdf_document_info", args: { path: "/tmp/a.pdf" } },
    ]);
  });

  test("rejects a malformed document info answer", async () => {
    mocks.result = { nope: true } as never;
    await expect(renderNativeDocumentInfo("/tmp/a.pdf")).resolves.toBeNull();
  });

  test("falls back when the render fails", async () => {
    expectConsole.warn("native render failed");
    mocks.result = new Error("boom");
    await expect(
      renderNativeThumbnail("/tmp/bad.pdf", 1, 240),
    ).resolves.toBeNull();
  });

  test("does nothing outside the Tauri shell", async () => {
    mocks.tauri = false;
    await expect(
      renderNativeThumbnail("/tmp/a.pdf", 1, 240),
    ).resolves.toBeNull();
    expect(mocks.invokes).toHaveLength(0);
  });

  test("treats an empty response as no render", async () => {
    mocks.result = new ArrayBuffer(0);
    await expect(
      renderNativeThumbnail("/tmp/a.pdf", 1, 240),
    ).resolves.toBeNull();
  });
});
