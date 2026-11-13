import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));

import {
  SERVER_FONTS_URL,
  forgetServerFontList,
} from "@editor/tools/pdfTextEditor/util/serverFonts";
import { resetLocalFontsCache } from "@editor/tools/pdfTextEditor/util/localFonts";
import { getExternalFontBytes } from "@editor/tools/pdfTextEditor/util/externalFonts";
import {
  BUNDLED_SCAN_FONTS,
  candidateFaces,
  deviceFontsCouldCover,
  loadBundledScanFaces,
  loadDeviceScanFaces,
  loadScriptScanFaces,
  _resetScanFacesForTests,
  scanFaceCssFamily,
  scanFaces,
  scanFacesGeneration,
  scanScriptsOf,
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
  forgetServerFontList();
  resetLocalFontsCache();
  _resetScanFacesForTests();
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

  it("lets the page draw the app's own copy, its bold cut under the regular family", async () => {
    const added: Array<[string, string]> = [];
    vi.stubGlobal(
      "FontFace",
      class {
        constructor(
          readonly family: string,
          _bytes: ArrayBuffer,
          readonly descriptors: { weight: string },
        ) {}
        load() {
          return Promise.resolve(this);
        }
      },
    );
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        add: (f: { family: string; descriptors: { weight: string } }) =>
          added.push([f.family, f.descriptors.weight]),
      },
    });
    try {
      get.mockRejectedValue(new Error("not found"));
      await loadBundledScanFaces();
      await vi.waitFor(() =>
        expect(added).toEqual(
          expect.arrayContaining([
            ["Carlito", "400"],
            ["Carlito", "700"],
          ]),
        ),
      );
      expect(scanFaceCssFamily("Carlito Bold")).toMatch(
        /^"Carlito Bold", "Carlito", /,
      );
    } finally {
      Reflect.deleteProperty(document, "fonts");
    }
  });

  it("loads the font bytes again after the server font list was reset", async () => {
    serve();
    await loadBundledScanFaces();
    expect(getExternalFontBytes("Carlito")).not.toBeNull();

    forgetServerFontList();
    await loadBundledScanFaces();
    expect(getExternalFontBytes("Carlito")?.byteLength).toBe(
      bytesOf("Carlito-Regular.ttf").byteLength,
    );
  });
});

describe("bundled scan faces across a server reset", () => {
  it("keeps the faces of the load that started after the reset", async () => {
    jarFetch.mockImplementation(
      async () => new Response(null, { status: 404 }),
    );
    let answer: (value: { data: unknown }) => void = () => {};
    get.mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve)),
    );
    const first = loadBundledScanFaces();
    forgetServerFontList();
    serve();
    await loadBundledScanFaces();
    answer({ data: manifest(ALL_FAMILIES) });
    await first;
    expect(labels()).toEqual(
      expect.arrayContaining(BUNDLED_SCAN_FONTS.map((spec) => spec.label)),
    );
  });
});

describe("script scan faces", () => {
  it("loads a Chinese font for Japanese text when the server has no Japanese one", async () => {
    serve(ALL_FAMILIES.filter((family) => family !== "Noto Sans JP"));
    await loadScriptScanFaces(scanScriptsOf("請求書 お支払い"));

    expect(labels()).toContain("Noto Sans SC");
  });

  it("loads the server's Japanese font once for Japanese text", async () => {
    serve();
    await loadScriptScanFaces(scanScriptsOf("請求書 お支払い ください"));
    await loadScriptScanFaces(scanScriptsOf("請求書 お支払い"));

    expect(labels().filter((label) => label === "Noto Sans JP")).toHaveLength(
      1,
    );
    expect(downloads("NotoSansJP-Regular.ttf")).toBe(1);
    expect(downloads("NotoSansSC-Regular.ttf")).toBe(0);
  });

  it("loads one Chinese font for Chinese text", async () => {
    serve();
    await loadScriptScanFaces(scanScriptsOf("发票 请于六月三十日前付款"));

    expect(labels()).toContain("Noto Sans SC");
    expect(downloads("NotoSansJP-Regular.ttf")).toBe(0);
  });

  it("tries again after the font list failed to load", async () => {
    get.mockRejectedValue(new Error("restarting"));
    await loadScriptScanFaces(scanScriptsOf("請求書 お支払い"));
    expect(labels()).not.toContain("Noto Sans JP");

    serve();
    await loadScriptScanFaces(scanScriptsOf("請求書 お支払い"));
    expect(labels()).toContain("Noto Sans JP");
  });

  it("tries again after the font download failed", async () => {
    serve(ALL_FAMILIES, new Set(["NotoSansJP-Regular.ttf"]));
    await loadScriptScanFaces(scanScriptsOf("請求書 お支払い"));
    expect(labels()).not.toContain("Noto Sans JP");

    serve();
    await loadScriptScanFaces(scanScriptsOf("請求書 お支払い"));
    expect(labels()).toContain("Noto Sans JP");
  });

  it("loads the server's Japanese font again after the server font list was reset", async () => {
    serve();
    await loadScriptScanFaces(scanScriptsOf("請求書 お支払い"));

    forgetServerFontList();
    await loadScriptScanFaces(scanScriptsOf("請求書 お支払い"));
    expect(labels().filter((label) => label === "Noto Sans JP")).toHaveLength(
      1,
    );
    expect(getExternalFontBytes("Noto Sans JP")).not.toBeNull();
  });

  it("offers the Liberation clones for Cyrillic but not where base-14 can draw", async () => {
    serve();
    await loadScriptScanFaces(scanScriptsOf("Счёт для Ивана"));

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

describe("which scripts device fonts are tried for", () => {
  it("tries device fonts for Latin, Cyrillic and listed scripts", () => {
    expect(deviceFontsCouldCover("Invoice 4471 for Jane")).toBe(true);
    expect(deviceFontsCouldCover("Счёт для Ивана")).toBe(true);
    expect(deviceFontsCouldCover("청구서 4471")).toBe(true);
  });

  it("does not for a script no listed device font draws", () => {
    expect(deviceFontsCouldCover("ინვოისი 4471")).toBe(false);
  });
});

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

  it("reads a family again after reading its file failed", async () => {
    let failing = true;
    (window as unknown as { queryLocalFonts: unknown }).queryLocalFonts =
      async () => [
        {
          family: "Georgia",
          style: "Regular",
          fullName: "Georgia Regular",
          postscriptName: "Georgia-Regular",
          blob: async () => {
            if (failing) throw new Error("busy");
            return { arrayBuffer: async () => bytesOf("DejaVuSerif.ttf") };
          },
        },
      ];
    expect(await loadDeviceScanFaces()).toBe(0);

    failing = false;
    expect(await loadDeviceScanFaces()).toBe(1);
  });

  it("skips families the server or base-14 already provide", async () => {
    serve();
    await loadScriptScanFaces(scanScriptsOf("請求書 お支払い"));
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

  it("reads a script's installed fonts once that script turns up after Latin", async () => {
    serve([]);
    stubDeviceFonts([
      { family: "Georgia", style: "Regular", file: "DejaVuSerif.ttf" },
      { family: "Yu Gothic", style: "Regular", file: "NotoSansJP-Regular.ttf" },
    ]);
    expect(await loadDeviceScanFaces()).toBe(1);

    await loadScriptScanFaces(scanScriptsOf("請求書 お支払い"));
    expect(await loadDeviceScanFaces()).toBe(2);
    expect(labels()).toEqual(expect.arrayContaining(["Georgia", "Yu Gothic"]));
  });

  it("keeps one face when two families share the same outlines", async () => {
    serve([]);
    await loadScriptScanFaces(scanScriptsOf("发票"));
    stubDeviceFonts([
      { family: "Heiti SC", style: "Regular", file: "DejaVuSans.ttf" },
      { family: "Heiti TC", style: "Regular", file: "DejaVuSans.ttf" },
    ]);
    expect(await loadDeviceScanFaces()).toBe(1);
  });
});
