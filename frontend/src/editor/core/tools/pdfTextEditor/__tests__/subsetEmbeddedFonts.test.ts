// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { parseTrueTypeCmap } from "@editor/tools/pdfTextEditor/charcode/CmapResolver";
import { subsetEmbeddedFonts } from "@editor/tools/pdfTextEditor/pdfdoc/passes/subsetEmbeddedFonts";
import { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { subsetTrueType } from "@editor/tools/pdfTextEditor/util/ttfSubset";

const FONT = path.join(
  import.meta.dirname,
  "../../../../../../../app/core/src/main/resources/static/fonts/LiberationSans-Regular.ttf",
);

const TAG = (s: string) =>
  ((s.charCodeAt(0) << 24) |
    (s.charCodeAt(1) << 16) |
    (s.charCodeAt(2) << 8) |
    s.charCodeAt(3)) >>>
  0;

function table(font: Uint8Array, tag: string): Uint8Array | null {
  const dv = new DataView(font.buffer, font.byteOffset, font.byteLength);
  for (let i = 0; i < dv.getUint16(4); i++) {
    const rec = 12 + i * 16;
    if (dv.getUint32(rec) !== TAG(tag)) continue;
    const offset = dv.getUint32(rec + 8);
    return font.subarray(offset, offset + dv.getUint32(rec + 12));
  }
  return null;
}

function glyph(font: Uint8Array, gid: number): Uint8Array {
  const head = table(font, "head")!;
  const loca = table(font, "loca")!;
  const glyf = table(font, "glyf")!;
  const long = new DataView(head.buffer, head.byteOffset).getInt16(50) !== 0;
  const dv = new DataView(loca.buffer, loca.byteOffset, loca.byteLength);
  const at = (i: number) =>
    long ? dv.getUint32(i * 4) : dv.getUint16(i * 2) * 2;
  return glyf.subarray(at(gid), at(gid + 1));
}

function trimmed(bytes: Uint8Array): number[] {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end -= 1;
  return [...bytes.subarray(0, end)];
}

function gidsOf(font: Uint8Array, text: string): number[] {
  const cmap = parseTrueTypeCmap(font)!;
  return [...text].map((ch) => cmap.get(ch.codePointAt(0)!)!);
}

const hex = (gids: number[]) =>
  gids.map((g) => g.toString(16).padStart(4, "0")).join("");

interface PdfOptions {
  content: string;
  encoding?: string;
  cidSubtype?: string;
  /** The page's /Font entry, in place of the inline `<< /F1 5 0 R >>`. */
  fonts?: string;
  info?: string;
  descriptorEntries?: string;
  /** Body of an object 11 added after the others. */
  extra?: string;
}

function pdfWithFont(font: Uint8Array, options: PdfOptions): Uint8Array {
  const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
  const objects: Uint8Array[] = [
    latin1("<< /Type /Catalog /Pages 2 0 R >>"),
    latin1("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    latin1(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font ${options.fonts ?? "<< /F1 5 0 R >>"} >> >>`,
    ),
    latin1(
      `<< /Length ${options.content.length} >>\nstream\n${options.content}\nendstream`,
    ),
    latin1(
      `<< /Type /Font /Subtype /Type0 /BaseFont /Carlito /Encoding /${options.encoding ?? "Identity-H"} /DescendantFonts [6 0 R] >>`,
    ),
    latin1(
      `<< /Type /Font /Subtype /${options.cidSubtype ?? "CIDFontType2"} /BaseFont /Carlito /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 7 0 R /CIDToGIDMap /Identity /W 10 0 R >>`,
    ),
    latin1(
      `<< /Type /FontDescriptor /FontName /Carlito /Flags 4 /FontBBox [0 0 1000 1000] /ItalicAngle 0 /Ascent 900 /Descent -200 /CapHeight 700 /StemV 80 /FontFile2 8 0 R${options.descriptorEntries ?? ""} >>`,
    ),
    (() => {
      const headPart = latin1(
        `<< /Length ${font.length} /Length1 ${font.length} >>\nstream\n`,
      );
      const tailPart = latin1("\nendstream");
      const out = new Uint8Array(
        headPart.length + font.length + tailPart.length,
      );
      out.set(headPart);
      out.set(font, headPart.length);
      out.set(tailPart, headPart.length + font.length);
      return out;
    })(),
    latin1(options.info ?? "<< /Producer (after the font) >>"),
    latin1(`[0 [${Array.from({ length: 400 }, (_, i) => 500 + i).join(" ")}]]`),
  ];
  if (options.extra) objects.push(latin1(options.extra));
  const parts: Uint8Array[] = [latin1("%PDF-1.4\n")];
  const offsets: number[] = [];
  let size = parts[0].length;
  objects.forEach((body, i) => {
    offsets.push(size);
    const chunk = [latin1(`${i + 1} 0 obj\n`), body, latin1("\nendobj\n")];
    for (const c of chunk) {
      parts.push(c);
      size += c.length;
    }
  });
  const xref =
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 9 0 R >>\nstartxref\n${size}\n%%EOF\n`;
  parts.push(latin1(xref));
  const out = new Uint8Array(size + xref.length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe("subsetTrueType", () => {
  test("keeps the used glyphs at their ids and empties the rest", async () => {
    const font = new Uint8Array(await readFile(FONT));
    const used = gidsOf(font, "Hello");
    const subset = subsetTrueType(font, used)!;

    expect(subset.length).toBeLessThan(font.length / 5);
    for (const gid of used)
      expect(trimmed(glyph(subset, gid))).toEqual(trimmed(glyph(font, gid)));
    const unused = gidsOf(font, "Z")[0];
    expect(glyph(font, unused).length).toBeGreaterThan(0);
    expect(glyph(subset, unused).length).toBe(0);
    const glyphCount = Math.max(...used) + 1;
    const maxp = table(subset, "maxp")!;
    expect(new DataView(maxp.buffer, maxp.byteOffset).getUint16(4)).toBe(
      glyphCount,
    );
    const metrics = (f: Uint8Array) => [...table(f, "hmtx")!.subarray(0, 8)];
    expect(metrics(subset)).toEqual(metrics(font));
    expect(table(subset, "GSUB")).toBeNull();
  });

  test("maps only the characters whose glyphs survive", async () => {
    const font = new Uint8Array(await readFile(FONT));
    const subset = subsetTrueType(font, gidsOf(font, "Hello"))!;
    const cmap = parseTrueTypeCmap(subset)!;

    expect(cmap.get("H".codePointAt(0)!)).toBe(gidsOf(font, "H")[0]);
    expect(cmap.has("Z".codePointAt(0)!)).toBe(false);
  });

  test("keeps the parts a composite glyph is built from", async () => {
    const font = new Uint8Array(await readFile(FONT));
    const [accented, base] = gidsOf(font, "ée");
    const composite = glyph(font, accented);
    const isComposite =
      new DataView(composite.buffer, composite.byteOffset).getInt16(0) < 0;
    expect(isComposite).toBe(true);

    const subset = subsetTrueType(font, [accented])!;
    expect(glyph(subset, base).length).toBeGreaterThan(0);
  });

  test("declines a file that is not a TrueType font", () => {
    expect(subsetTrueType(new Uint8Array([1, 2, 3, 4]), [1])).toBeNull();
  });
});

describe("subsetEmbeddedFonts", () => {
  async function fontFileIn(pdfBytes: Uint8Array): Promise<Uint8Array> {
    const pdf = (await RawPdf.parse(pdfBytes))!;
    return (await pdf.streamData(8))!;
  }

  test("shrinks the embedded font to the glyphs the page draws", async () => {
    const font = new Uint8Array(await readFile(FONT));
    const used = gidsOf(font, "Hello");
    const pdf = pdfWithFont(font, {
      content: `BT /F1 12 Tf <${hex(used)}> Tj ET`,
    });

    const out = await subsetEmbeddedFonts(pdf, [font]);

    expect(out.length).toBeLessThan(pdf.length / 5);
    const embedded = await fontFileIn(out);
    for (const gid of used)
      expect(trimmed(glyph(embedded, gid))).toEqual(trimmed(glyph(font, gid)));
    const reread = (await RawPdf.parse(out))!;
    expect(reread.objectBody(9)).toContain("after the font");
    expect(reread.dictName(reread.objectBody(5)!, "BaseFont")).toMatch(
      /^[A-Z]{6}\+Carlito$/,
    );
    expect(reread.dictName(reread.objectBody(7)!, "FontName")).toMatch(
      /^[A-Z]{6}\+Carlito$/,
    );
    expect(reread.pageNumbers()).toHaveLength(1);
    const widths = reread.valueSpan(reread.objectBody(6)!, "W")!.text;
    for (const gid of used) expect(widths).toContain(`${gid} [${500 + gid}]`);
    expect(widths.length).toBeLessThan(200);
    expect(reread.objectBody(10)!.trim()).toBe("null");
  });

  test("counts only the text shown in the embedded font", async () => {
    const font = new Uint8Array(await readFile(FONT));
    const [h] = gidsOf(font, "H");
    const other = 0x7a7a;
    const pdf = pdfWithFont(font, {
      content: `BT /F1 12 Tf q /Other 9 Tf (zz) Tj Q <${hex([h])}> Tj ET`,
    });

    const embedded = await fontFileIn(await subsetEmbeddedFonts(pdf, [font]));

    const maxp = table(embedded, "maxp")!;
    const glyphCount = new DataView(maxp.buffer, maxp.byteOffset).getUint16(4);
    expect(glyphCount).toBe(h + 1);
    expect(glyphCount).toBeLessThan(other);
    expect(glyph(embedded, h).length).toBeGreaterThan(0);
  });

  test("reads glyph ids from literal strings and arrays too", async () => {
    const font = new Uint8Array(await readFile(FONT));
    const [h, i] = gidsOf(font, "Hi");
    const escaped = (gid: number) =>
      `\\${(gid >> 8).toString(8).padStart(3, "0")}\\${(gid & 0xff).toString(8).padStart(3, "0")}`;
    const pdf = pdfWithFont(font, {
      content: `BT /F1 12 Tf [(${escaped(h)}) -20 <${hex([i])}>] TJ ET`,
    });

    const embedded = await fontFileIn(await subsetEmbeddedFonts(pdf, [font]));

    expect(glyph(embedded, h).length).toBeGreaterThan(0);
    expect(glyph(embedded, i).length).toBeGreaterThan(0);
  });

  test.each([
    ["a font the session did not embed", {}, false],
    ["codes that are not glyph ids", { encoding: "UniJIS-UCS2-H" }, true],
    ["a font that is not CID TrueType", { cidSubtype: "CIDFontType0" }, true],
  ])("leaves the file alone for %s", async (_label, options, known) => {
    const font = new Uint8Array(await readFile(FONT));
    const pdf = pdfWithFont(font, {
      content: "BT /F1 12 Tf <0001> Tj ET",
      ...options,
    });
    expect(await subsetEmbeddedFonts(pdf, known ? [font] : [])).toBe(pdf);
  });

  test("leaves a font the opened document already embedded", async () => {
    const font = new Uint8Array(await readFile(FONT));
    const pdf = pdfWithFont(font, { content: "BT /F1 12 Tf <0001> Tj ET" });
    const without = pdfWithFont(font.subarray(0, 64), { content: "" });

    expect(await subsetEmbeddedFonts(pdf, [font], pdf)).toBe(pdf);
    expect(
      (await subsetEmbeddedFonts(pdf, [font], without)).length,
    ).toBeLessThan(pdf.length / 5);
  });

  test("keeps glyphs shown in a font bound through an indirect /Font", async () => {
    const font = new Uint8Array(await readFile(FONT));
    const [h] = gidsOf(font, "H");
    const pdf = pdfWithFont(font, {
      content: `BT /F1 12 Tf <${hex([h])}> Tj ET`,
      fonts: "11 0 R",
      extra: "<< /F1 5 0 R >>",
    });

    const embedded = await fontFileIn(await subsetEmbeddedFonts(pdf, [font]));

    expect(glyph(embedded, h).length).toBeGreaterThan(0);
  });

  test("keeps glyphs shown after a graphics state may have set the font", async () => {
    const font = new Uint8Array(await readFile(FONT));
    const [h] = gidsOf(font, "H");
    const pdf = pdfWithFont(font, {
      content: `BT /Other 12 Tf /GS1 gs <${hex([h])}> Tj ET`,
    });

    const embedded = await fontFileIn(await subsetEmbeddedFonts(pdf, [font]));

    expect(glyph(embedded, h).length).toBeGreaterThan(0);
  });

  test("keeps a widths array another font still points at", async () => {
    const font = new Uint8Array(await readFile(FONT));
    const pdf = pdfWithFont(font, {
      content: "BT /F1 12 Tf <0001> Tj ET",
      extra: "<< /Type /Font /Subtype /CIDFontType2 /W 10 0 R >>",
    });

    const reread = (await RawPdf.parse(
      await subsetEmbeddedFonts(pdf, [font]),
    ))!;

    expect(reread.objectBody(10)!.trim()).not.toBe("null");
    expect(
      reread.valueSpan(reread.objectBody(6)!, "W")!.text.length,
    ).toBeLessThan(200);
  });

  test(
    "is not slowed by a /Size inside a string",
    { timeout: 5000 },
    async () => {
      const font = new Uint8Array(await readFile(FONT));
      const pdf = pdfWithFont(font, {
        content: "BT /F1 12 Tf <0001> Tj ET",
        info: "<< /Title (/Size 1000000000) >>",
      });

      expect((await subsetEmbeddedFonts(pdf, [font])).length).toBeLessThan(
        pdf.length / 5,
      );
    },
  );

  test("drops the CIDSet that still lists the emptied glyphs", async () => {
    const font = new Uint8Array(await readFile(FONT));
    const pdf = pdfWithFont(font, {
      content: "BT /F1 12 Tf <0001> Tj ET",
      descriptorEntries: " /CIDSet 11 0 R",
      extra: "<< /Length 2 >>\nstream\n\u00ff\u00ff\nendstream",
    });

    const reread = (await RawPdf.parse(
      await subsetEmbeddedFonts(pdf, [font]),
    ))!;

    const descriptor = reread.objectBody(7)!;
    expect(reread.valueSpan(descriptor, "CIDSet")).toBeNull();
    expect(reread.dictName(descriptor, "FontName")).toMatch(
      /^[A-Z]{6}\+Carlito$/,
    );
  });

  test("leaves the file alone when a page holds an inline image", async () => {
    const font = new Uint8Array(await readFile(FONT));
    const pdf = pdfWithFont(font, {
      content: "BT /F1 12 Tf <0001> Tj ET BI /W 1 /H 1 ID \u0000 EI",
    });
    expect(await subsetEmbeddedFonts(pdf, [font])).toBe(pdf);
  });
});
