/**
 * Contract for the native tile path: tiles come from the OS engine when the
 * file has a disk path, the rect is converted from the tiling plugin's
 * top-left page space to PDF space, and every miss falls back to the engine
 * worker instead of failing the render.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { PdfTaskHelper, type PdfEngine } from "@embedpdf/models";

const mocks = vi.hoisted(() => ({
  nativeBlob: null as Blob | null,
  nativeCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
}));

vi.mock("@app/services/nativePdfRender", () => ({
  renderNativePdfRectBlob: async (
    _path: string,
    rect: Record<string, unknown>,
  ) => {
    mocks.nativeCalls.push(rect);
    return mocks.nativeBlob;
  },
}));

import { wrapEngineForNativeTiles } from "@app/services/nativeEngineTiles";

const ENGINE_BLOB = new Blob(["engine"], { type: "image/jpeg" });
const NATIVE_BLOB = new Blob(["native"], { type: "image/jpeg" });
const PATH = "/tmp/report.pdf";

const makeEngine = () => {
  const renderPageRect = vi.fn(() => PdfTaskHelper.resolve<Blob>(ENGINE_BLOB));
  const engine = {
    renderPageRect,
    destroy: vi.fn(),
  } as unknown as PdfEngine<Blob>;
  return { engine, renderPageRect };
};

const makePage = (rotation = 0) =>
  ({
    index: 2,
    size: { width: 612, height: 792 },
    rotation,
  }) as never;

const RECT = {
  origin: { x: 10, y: 700 },
  size: { width: 300, height: 90 },
};

describe("nativeEngineTiles (desktop)", () => {
  beforeEach(() => {
    mocks.nativeBlob = NATIVE_BLOB;
    mocks.nativeCalls.length = 0;
    localStorage.removeItem("stirling.nativeTiles");
  });

  test("renders tiles natively with a PDF-space rect", async () => {
    const { engine, renderPageRect } = makeEngine();
    const wrapped = wrapEngineForNativeTiles(engine, () => PATH);

    const blob = await wrapped
      .renderPageRect(undefined as never, makePage(), RECT as never, {
        scaleFactor: 1,
        dpr: 2,
      })
      .toPromise();

    expect(blob).toBe(NATIVE_BLOB);
    expect(renderPageRect).not.toHaveBeenCalled();
    expect(mocks.nativeCalls).toEqual([
      // y flips to PDF space: 792 - 700 - 90.
      { page: 3, x: 10, y: 2, width: 300, height: 90, scale: 2 },
    ]);
  });

  test("falls back to the engine when the file has no disk path", async () => {
    const { engine, renderPageRect } = makeEngine();
    const wrapped = wrapEngineForNativeTiles(engine, () => null);

    const blob = await wrapped
      .renderPageRect(undefined as never, makePage(), RECT as never)
      .toPromise();

    expect(blob).toBe(ENGINE_BLOB);
    expect(mocks.nativeCalls).toHaveLength(0);
    expect(renderPageRect).toHaveBeenCalledTimes(1);
  });

  test("keeps rotated pages on the engine", async () => {
    const { engine, renderPageRect } = makeEngine();
    const wrapped = wrapEngineForNativeTiles(engine, () => PATH);

    const blob = await wrapped
      .renderPageRect(undefined as never, makePage(90), RECT as never)
      .toPromise();

    expect(blob).toBe(ENGINE_BLOB);
    expect(mocks.nativeCalls).toHaveLength(0);
    expect(renderPageRect).toHaveBeenCalledTimes(1);
  });

  test("falls back when the native render returns nothing", async () => {
    mocks.nativeBlob = null;
    const { engine, renderPageRect } = makeEngine();
    const wrapped = wrapEngineForNativeTiles(engine, () => PATH);

    const blob = await wrapped
      .renderPageRect(undefined as never, makePage(), RECT as never)
      .toPromise();

    expect(blob).toBe(ENGINE_BLOB);
    expect(renderPageRect).toHaveBeenCalledTimes(1);
  });

  test("the kill switch keeps the engine's own instance", () => {
    localStorage.setItem("stirling.nativeTiles", "off");
    const { engine } = makeEngine();
    expect(wrapEngineForNativeTiles(engine, () => PATH)).toBe(engine);
  });

  test("passes other engine methods through bound", () => {
    const { engine } = makeEngine();
    const wrapped = wrapEngineForNativeTiles(engine, () => PATH);
    expect(wrapped.destroy).toBeInstanceOf(Function);
    wrapped.destroy?.();
    expect(engine.destroy).toHaveBeenCalledTimes(1);
  });
});
