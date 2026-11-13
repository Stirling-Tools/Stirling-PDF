// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { compareFontPrograms } from "@editor/tools/pdfTextEditor/util/fontProgramMatch";

const FONTS = path.join(
  import.meta.dirname,
  "../../../../../../../app/core/src/main/resources/static/fonts",
);
const font = async (name: string) =>
  new Uint8Array(await readFile(path.join(FONTS, name)));

function tableOffset(bytes: Uint8Array, tag: string): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < dv.getUint16(4); i++) {
    const rec = 12 + i * 16;
    const name = String.fromCharCode(...bytes.subarray(rec, rec + 4));
    if (name === tag) return dv.getUint32(rec + 8);
  }
  throw new Error(`no ${tag} table`);
}

// Same widths, every outline redrawn: how another version of a font, or a metric-compatible clone, compares.
function withOtherOutlines(bytes: Uint8Array): Uint8Array {
  const out = bytes.slice();
  const glyf = tableOffset(out, "glyf");
  for (let at = glyf + 64; at < glyf + 40_000; at += 7) out[at] ^= 0x55;
  return out;
}

describe("compareFontPrograms", () => {
  test("recognises the same font by its outlines", async () => {
    const liberation = await font("LiberationSans-Regular.ttf");
    expect(compareFontPrograms(liberation, liberation.slice())).toBe("same");
  });

  test("accepts different outlines when every shared width agrees", async () => {
    const liberation = await font("LiberationSans-Regular.ttf");
    expect(compareFontPrograms(liberation, withOtherOutlines(liberation))).toBe(
      "same",
    );
  });

  test.each([
    ["another typeface", "DejaVuSans.ttf"],
    ["another weight of the same family", "LiberationSans-Bold.ttf"],
    ["a serif of the same foundry", "LiberationSerif-Regular.ttf"],
  ])("tells %s apart", async (_label, other) => {
    const liberation = await font("LiberationSans-Regular.ttf");
    expect(compareFontPrograms(liberation, await font(other))).toBe(
      "different",
    );
  });

  test("gives no verdict on something that is not a font", async () => {
    const liberation = await font("LiberationSans-Regular.ttf");
    const noise = new Uint8Array(512).fill(7);
    expect(compareFontPrograms(noise, liberation)).toBe("unknown");
    expect(compareFontPrograms(liberation, noise)).toBe("unknown");
    expect(compareFontPrograms(new Uint8Array(0), liberation)).toBe("unknown");
  });
});
