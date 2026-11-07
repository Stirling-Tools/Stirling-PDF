import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));

import {
  SERVER_FONTS_URL,
  resetServerFontsCache,
} from "@editor/tools/pdfTextEditor/util/serverFonts";
import { resetLocalFontsCache } from "@editor/tools/pdfTextEditor/util/localFonts";
import { getExternalFontBytes } from "@editor/tools/pdfTextEditor/util/externalFonts";
import {
  BUNDLED_SCAN_FONTS,
  candidateFaces,
  loadBundledScanFaces,
  loadDeviceScanFaces,
  loadScriptScanFaces,
  resetScanFaces,
  scanFaces,
  scanFacesGeneration,
} from "@editor/tools/pdfTextEditor/util/scanFontLibrary";
import { FONT_DIR } from "@editor/tools/pdfTextEditor/__tests__/scanFixtures";

const SERVED: Array<[family: string, style: string, file: string]> = [
  ["Carlito", "Regular", "Carlito-Regular.ttf"],
  ["Carlito", "Bold", "Carlito-Bold.ttf"],
  ["Caladea", "Regular", "Caladea-Regular.ttf"],
  ["Caladea", "Bold", "Caladea-Bold.ttf"],
  ["DejaVu Sans", "Book", "DejaVuSans.ttf"],
  ["DejaVu Sans", "Bold", "DejaVuSans-Bold.ttf"],
  ["DejaVu Sans", "Oblique", "DejaVuSans-Oblique.ttf"],
  ["DejaVu Serif", "Book", "DejaVuSerif.ttf"],
  ["DejaVu Serif", "Bold", "DejaVuSerif-Bold.ttf"],
  ["Liberation Sans", "Regular", "LiberationSans-Regular.ttf"],
  ["Liberation Sans", "Bold", "LiberationSans-Bold.ttf"],
  ["Liberation Serif", "Regular", "LiberationSerif-Regular.ttf"],
  ["Liberation Mono", "Regular", "LiberationMono-Regular.ttf"],
  ["Noto Sans JP", "Regular", "NotoSansJP-Regular.ttf"],
  ["Noto Sans SC", "Regular", "NotoSansSC-Regular.ttf"],
];

const fileBytes = new Map<string, ArrayBuffer>();

function bytesOf(file: string): ArrayBuffer {
  let bytes = fileBytes.get(file);
  if (!bytes) {
    bytes = new Uint8Array(readFileSync(path.join(FONT_DIR, file))).buffer;
    fileBytes.set(file, bytes);
  }
  return bytes;
}

const idOf = (file: string) =>
  (SERVED.findIndex(([, , f]) => f === file) + 1)
    .toString(16)
    .padStart(64, "0");

function manifest(families: string[]) {
  return {
    families: families.map((family) => ({
      family,
      faces: SERVED.filter(([f]) => f === family).map(([, style, file]) => ({
        id: idOf(file),
        style,
        bold: style === "Bold",
        italic: style === "Oblique",
        weight: style === "Bold" ? 700 : 400,
        postscriptName: file.replace(".ttf", ""),
        format: "ttf",
        size: bytesOf(file).byteLength,
      })),
    })),
  };
}

const ALL_FAMILIES = [...new Set(SERVED.map(([family]) => family))];

function serve(families = ALL_FAMILIES, failing = new Set<string>()): void {
  get.mockImplementation(async (url: string) => {
    if (url === SERVER_FONTS_URL) return { data: manifest(families) };
    const served = SERVED.find(([, , file]) => url.endsWith(idOf(file)));
    if (!served || failing.has(served[2])) throw new Error("unavailable");
    return { data: bytesOf(served[2]) };
  });
}

function downloads(file: string): number {
  return get.mock.calls.filter(([url]) => url.endsWith(idOf(file))).length;
}

const jarFetch = vi.fn(async (url: string) => {
  const file = url.slice(url.lastIndexOf("/") + 1);
  return SERVED.some(([, , f]) => f === file)
    ? new Response(bytesOf(file))
    : new Response(null, { status: 404 });
});

function labels(): string[] {
  return scanFaces().map((face) => face.label);
}

beforeEach(() => {
  get.mockReset();
  jarFetch.mockClear();
  vi.stubGlobal("fetch", jarFetch);
  resetServerFontsCache();
  resetLocalFontsCache();
  resetScanFaces();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts;
});

describe("bundled scan faces", () => {
  it("builds the four bundled faces, each with its bold cut, from the server", async () => {
    serve();
    const before = scanFacesGeneration();
    await loadBundledScanFaces();

    const bundled = scanFaces().filter((face) => face.source === "bundled");
    expect(bundled.map((face) => face.label)).toEqual(
      BUNDLED_SCAN_FONTS.map((spec) => spec.label),
    );
    for (const face of bundled) {
      expect(face.bold).not.toBe(face.family);
      expect(face.metrics?.size).toBe(2);
    }
    expect(scanFacesGeneration()).toBeGreaterThan(before);
    expect(jarFetch).not.toHaveBeenCalled();
  });

  it("loads a face again after its download failed", async () => {
    jarFetch.mockImplementationOnce(
      async () => new Response(null, { status: 404 }),
    );
    serve(ALL_FAMILIES, new Set(["Caladea-Regular.ttf"]));
    await loadBundledScanFaces();
    expect(labels()).not.toContain("Cambria (Caladea)");

    serve();
    await loadBundledScanFaces();
    expect(labels()).toContain("Cambria (Caladea)");
  });

  it("falls back to the app's own copy when the server has no font list", async () => {
    get.mockRejectedValue(new Error("not found"));
    await loadBundledScanFaces();

    expect(labels()).toEqual(
      expect.arrayContaining(BUNDLED_SCAN_FONTS.map((spec) => spec.label)),
    );
    expect(getExternalFontBytes("Carlito Bold")?.byteLength).toBe(
      bytesOf("Carlito-Bold.ttf").byteLength,
    );
  });

  it("falls back to the app's own copy for the fonts an older server lacks", async () => {
    serve(["DejaVu Sans", "DejaVu Serif"]);
    await loadBundledScanFaces();

    expect(labels()).toEqual(
      expect.arrayContaining(BUNDLED_SCAN_FONTS.map((spec) => spec.label)),
    );
    expect(jarFetch.mock.calls.map(([url]) => url.split("/").pop())).toEqual(
      expect.arrayContaining(["Carlito-Regular.ttf", "Caladea-Bold.ttf"]),
    );
    expect(downloads("DejaVuSans.ttf")).toBe(1);
  });
});

describe("script scan faces", () => {
  it("loads the server's Japanese font once for Japanese text", async () => {
    serve();
    await loadScriptScanFaces("請求書 お支払い ください");
    await loadScriptScanFaces("請求書 お支払い");

    expect(labels().filter((label) => label === "Noto Sans JP")).toHaveLength(
      1,
    );
    expect(downloads("NotoSansJP-Regular.ttf")).toBe(1);
    expect(downloads("NotoSansSC-Regular.ttf")).toBe(0);
  });

  it("loads one Chinese font for Chinese text", async () => {
    serve();
    await loadScriptScanFaces("发票 请于六月三十日前付款");

    expect(labels()).toContain("Noto Sans SC");
    expect(downloads("NotoSansJP-Regular.ttf")).toBe(0);
  });

  it("tries again after the font list failed to load", async () => {
    get.mockRejectedValue(new Error("restarting"));
    await loadScriptScanFaces("請求書 お支払い");
    expect(labels()).not.toContain("Noto Sans JP");

    serve();
    await loadScriptScanFaces("請求書 お支払い");
    expect(labels()).toContain("Noto Sans JP");
  });

  it("tries again after the font download failed", async () => {
    serve(ALL_FAMILIES, new Set(["NotoSansJP-Regular.ttf"]));
    await loadScriptScanFaces("請求書 お支払い");
    expect(labels()).not.toContain("Noto Sans JP");

    serve();
    await loadScriptScanFaces("請求書 お支払い");
    expect(labels()).toContain("Noto Sans JP");
  });

  it("offers the Liberation clones for Cyrillic but not where base-14 can draw", async () => {
    serve();
    await loadScriptScanFaces("Счёт для Ивана");

    expect(labels()).toEqual(
      expect.arrayContaining([
        "Arial (Liberation Sans)",
        "Times New Roman (Liberation Serif)",
        "Courier New (Liberation Mono)",
      ]),
    );
    const cyrillic = candidateFaces("Счёт для Ивана").map((f) => f.label);
    expect(cyrillic).toContain("Arial (Liberation Sans)");
    expect(cyrillic).not.toContain("Helvetica / Arial");
    const latin = candidateFaces("Invoice for Jane").map((f) => f.label);
    expect(latin).toContain("Helvetica / Arial");
    expect(latin).not.toContain("Arial (Liberation Sans)");
  });
});

interface StubFace {
  family: string;
  style: string;
  file: string;
}

function stubDeviceFonts(faces: StubFace[]): void {
  (window as unknown as { queryLocalFonts: unknown }).queryLocalFonts =
    async () =>
      faces.map(({ family, style, file }) => ({
        family,
        style,
        fullName: `${family} ${style}`,
        postscriptName: `${family.replace(/ /g, "")}-${style}`,
        blob: async () => ({ arrayBuffer: async () => bytesOf(file) }),
      }));
}

describe("device scan faces", () => {
  it("loads the bold cut of a family whose name contains a style word", async () => {
    stubDeviceFonts([
      {
        family: "Times New Roman",
        style: "Regular",
        file: "LiberationSerif-Regular.ttf",
      },
      { family: "Times New Roman", style: "Bold", file: "Carlito-Bold.ttf" },
    ]);
    expect(await loadDeviceScanFaces()).toBe(1);

    const times = scanFaces().find((face) => face.label === "Times New Roman");
    expect(times?.bold).toBe("Times New Roman Bold");
    expect(times?.metrics?.size).toBe(2);
  });

  it("asks again after the user declined", async () => {
    (window as unknown as { queryLocalFonts: unknown }).queryLocalFonts =
      async () => {
        throw new DOMException("denied", "NotAllowedError");
      };
    expect(await loadDeviceScanFaces()).toBe(0);

    stubDeviceFonts([
      { family: "Georgia", style: "Regular", file: "DejaVuSerif.ttf" },
    ]);
    expect(await loadDeviceScanFaces()).toBe(1);
  });

  it("skips families the server or base-14 already provide", async () => {
    serve();
    await loadScriptScanFaces("請求書 お支払い");
    stubDeviceFonts([
      { family: "Noto Sans JP", style: "Regular", file: "Caladea-Regular.ttf" },
      { family: "Helvetica", style: "Regular", file: "Carlito-Regular.ttf" },
      { family: "Georgia", style: "Regular", file: "DejaVuSerif.ttf" },
    ]);
    expect(await loadDeviceScanFaces()).toBe(1);

    expect(labels().filter((label) => label === "Noto Sans JP")).toHaveLength(
      1,
    );
    expect(scanFaces().filter((face) => face.family === "Helvetica")).toEqual([
      expect.objectContaining({ source: "base14" }),
    ]);
  });

  it("keeps one face when two families share the same outlines", async () => {
    serve([]);
    await loadScriptScanFaces("发票");
    stubDeviceFonts([
      { family: "Heiti SC", style: "Regular", file: "DejaVuSans.ttf" },
      { family: "Heiti TC", style: "Regular", file: "DejaVuSans.ttf" },
    ]);
    expect(await loadDeviceScanFaces()).toBe(1);
  });
});
