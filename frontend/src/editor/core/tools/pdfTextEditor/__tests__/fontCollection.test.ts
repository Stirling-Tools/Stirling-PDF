// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  facePostscriptNames,
  fontFace,
} from "@editor/tools/pdfTextEditor/util/fontCollection";
import { parseFontMetrics } from "@editor/tools/pdfTextEditor/util/fontMetrics";

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
