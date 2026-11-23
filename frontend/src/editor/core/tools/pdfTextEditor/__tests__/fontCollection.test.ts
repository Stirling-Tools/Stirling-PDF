// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  facePostscriptNames,
  fontFace,
} from "@editor/tools/pdfTextEditor/util/fontCollection";
import {
  embeddingForbidden,
  hasTrueTypeOutlines,
  parseFontMetrics,
} from "@editor/tools/pdfTextEditor/util/fontMetrics";
import {
  loadLocalFont,
  resetLocalFontsCache,
} from "@editor/tools/pdfTextEditor/util/localFonts";
import { readTableDirectory } from "@editor/tools/pdfTextEditor/util/sfnt";

const FONTS = path.join(
  import.meta.dirname,
  "../../../../../../../app/core/src/main/resources/static/fonts",
);

function collect(fonts: Uint8Array[]): Uint8Array {
  const header = 12 + fonts.length * 4;
  const size = fonts.reduce((s, f) => s + f.length, header);
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x74746366);
  dv.setUint32(4, 0x00010000);
  dv.setUint32(8, fonts.length);
  let at = header;
  fonts.forEach((font, i) => {
    dv.setUint32(12 + i * 4, at);
    out.set(font, at);
    const count = dv.getUint16(at + 4);
    for (let t = 0; t < count; t++) {
      const rec = at + 12 + t * 16 + 8;
      dv.setUint32(rec, dv.getUint32(rec) + at);
    }
    at += font.length;
  });
  return out;
}

const read = async (file: string) =>
  new Uint8Array(await readFile(path.join(FONTS, file)));

describe("fontFace", () => {
  test("returns a plain font file unchanged", async () => {
    const regular = await read("Carlito-Regular.ttf");
    expect(fontFace(regular)).toBe(regular);
  });

  test("pulls the named face out of a collection as a usable font", async () => {
    const regular = await read("Carlito-Regular.ttf");
    const bold = await read("Carlito-Bold.ttf");
    const ttc = collect([regular, bold]);
    expect(facePostscriptNames(ttc)).toEqual(["Carlito", "Carlito-Bold"]);
    expect(parseFontMetrics(ttc)).toBeNull();

    const face = fontFace(ttc, "Carlito-Bold")!;
    expect(facePostscriptNames(face)).toEqual(["Carlito-Bold"]);
    expect(parseFontMetrics(face)).toEqual(parseFontMetrics(bold));
  });

  test("gives up on a name the collection does not hold", async () => {
    const ttc = collect([await read("Carlito-Regular.ttf")]);
    expect(fontFace(ttc, "Calibri")).toBeNull();
  });
});

function withFsType(font: Uint8Array, fsType: number): Uint8Array {
  const out = font.slice();
  const dv = new DataView(out.buffer);
  dv.setUint16(readTableDirectory(dv)!.get("OS/2")!.offset + 8, fsType);
  return out;
}

describe("embeddingForbidden", () => {
  test.each([
    ["installable", 0x0000, false],
    ["preview and print", 0x0004, false],
    ["editable", 0x0008, false],
    ["editable, no subsetting", 0x0108, false],
    ["restricted licence", 0x0002, true],
    ["bitmap only", 0x0208, true],
  ])("%s", async (_label, fsType, forbidden) => {
    const font = withFsType(await read("Carlito-Regular.ttf"), fsType);
    expect(embeddingForbidden(font)).toBe(forbidden);
  });

  test("a file with no OS/2 table declares no restriction", () => {
    expect(embeddingForbidden(new Uint8Array([0, 1, 0, 0, 0, 0]))).toBe(false);
  });
});

describe("hasTrueTypeOutlines", () => {
  test("accepts glyf outlines", async () => {
    expect(hasTrueTypeOutlines(await read("Carlito-Regular.ttf"))).toBe(true);
  });

  test("rejects CFF outlines", async () => {
    expect(hasTrueTypeOutlines(await read("NotoSansTC-Regular.ttf"))).toBe(
      false,
    );
  });
});

describe("loadLocalFont", () => {
  type Query = () => Promise<unknown[]>;
  const scope = globalThis as unknown as {
    window?: { queryLocalFonts?: Query };
  };

  function installFont(bytes: Uint8Array): void {
    scope.window = {
      queryLocalFonts: async () => [
        {
          family: "Carlito",
          fullName: "Carlito",
          style: "Regular",
          postscriptName: "Carlito",
          blob: async () => new Blob([bytes.slice()]),
        },
      ],
    };
  }

  afterEach(() => {
    resetLocalFontsCache();
    delete scope.window;
  });

  test("hands over a font whose licence allows embedding", async () => {
    installFont(withFsType(await read("Carlito-Regular.ttf"), 0x0008));
    expect(await loadLocalFont("Carlito")).toHaveProperty("bytes");
  });

  test("refuses a font whose licence forbids embedding", async () => {
    installFont(withFsType(await read("Carlito-Regular.ttf"), 0x0002));
    expect(await loadLocalFont("Carlito")).toEqual({ refused: "licence" });
  });

  test("refuses a font with CFF outlines as unavailable", async () => {
    installFont(await read("NotoSansTC-Regular.ttf"));
    expect(await loadLocalFont("Carlito")).toEqual({ refused: "unavailable" });
  });
});
