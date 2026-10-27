import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { RawPdf, setDictEntry } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  appendRevision,
  plainObject,
} from "@editor/tools/pdfTextEditor/pdfdoc/revision";
import {
  decodeTextString,
  encodeTextString,
} from "@editor/tools/pdfTextEditor/pdfdoc/textString";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

const FIGURE = 8;

function figurePdf(): Uint8Array {
  return buildClassicPdf(
    [
      {
        num: 1,
        body: "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> >>",
      },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /StructParents 0 >>",
      },
      {
        num: 4,
        body: streamBody("", "/Figure <</MCID 0>> BDC 0 0 10 10 re f EMC"),
      },
      {
        num: 5,
        body: "<< /Type /StructTreeRoot /K 7 0 R /ParentTree 6 0 R /ParentTreeNextKey 1 >>",
      },
      { num: 6, body: "<< /Nums [0 [8 0 R]] >>" },
      {
        num: 7,
        body: "<< /Type /StructElem /S /Document /P 5 0 R /K [8 0 R] >>",
      },
      {
        num: FIGURE,
        body: "<< /Type /StructElem /S /Figure /P 7 0 R /Pg 3 0 R /K 0 /Alt (old) >>",
      },
    ],
    1,
  );
}

async function withAlt(alt: string): Promise<Uint8Array> {
  const pdf = await RawPdf.parse(figurePdf());
  const body = setDictEntry(
    pdf!.objectBody(FIGURE)!,
    "Alt",
    encodeTextString(alt),
  );
  return appendRevision(pdf!, [{ num: FIGURE, body: plainObject(body!) }])!;
}

/** The figure's /Alt as PDFium decodes it. */
async function readAlt(bytes: Uint8Array): Promise<string> {
  const doc = await EditorDocument.open(bytes);
  try {
    const m = doc.module;
    const tree = m.FPDF_StructTree_GetForPage(doc.page(0).pagePtr);
    const document = m.FPDF_StructTree_GetChildAtIndex(tree, 0);
    const figure = m.FPDF_StructElement_GetChildAtIndex(document, 0);
    const len = m.FPDF_StructElement_GetAltText(figure, 0, 0);
    const buf = m.pdfium.wasmExports.malloc(Math.max(len, 2));
    m.FPDF_StructElement_GetAltText(figure, buf, len);
    const alt = len > 2 ? m.pdfium.UTF16ToString(buf) : "";
    m.pdfium.wasmExports.free(buf);
    m.FPDF_StructTree_Close(tree);
    return alt;
  } finally {
    doc.dispose();
  }
}

beforeAll(async () => {
  const wasmPath = createRequire(import.meta.url).resolve(
    "@embedpdf/pdfium/pdfium.wasm",
  );
  const wasmBytes = await readFile(wasmPath);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Promise.resolve(
        new Response(wasmBytes, {
          headers: { "Content-Type": "application/wasm" },
        }),
      ),
    ),
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("encodeTextString", () => {
  test("writes printable ASCII as a literal, escaping its delimiters", () => {
    expect(encodeTextString("a (b) \\ c")).toBe("(a \\(b\\) \\\\ c)");
  });

  test("writes anything else as UTF-16BE behind a byte order mark", () => {
    expect(encodeTextString("caf\u00e9")).toBe("<FEFF00630061006600E9>");
    expect(encodeTextString("\u{1F600}")).toBe("<FEFFD83DDE00>");
    expect(encodeTextString("a\nb")).toBe("<FEFF0061000A0062>");
  });

  test.each([
    ["plain ASCII", "Bar chart of revenue by region"],
    ["delimiters", "Ratio (a) \\ (b)"],
    ["accented Latin", "Caf\u00e9 cr\u00e8me br\u00fbl\u00e9e"],
    ["non-Latin script", "\u53ce\u76ca\u306e\u30b0\u30e9\u30d5"],
    ["astral emoji", "Chart \u{1F4C8}"],
    ["empty", ""],
  ])("PDFium reads back %s exactly", async (_label, alt) => {
    expect(await readAlt(await withAlt(alt))).toBe(alt);
  });
});

describe("decodeTextString", () => {
  test.each([
    ["plain ASCII", "Bar chart (Q3)"],
    ["Latin-1 beyond ASCII", "Caf\u00e9"],
    ["CJK", "\u6536\u5165"],
    ["astral", "\u{1F4C8} up"],
  ])("reads back what encodeTextString writes: %s", (_, text) => {
    expect(decodeTextString(encodeTextString(text))).toBe(text);
  });

  test("reads literal escapes, balanced parentheses and octal codes", () => {
    expect(decodeTextString("(a\\(b\\) (c) \\101\\\\ \\n)")).toBe(
      "a(b) (c) A\\ \n",
    );
  });

  test("joins a line continued with a backslash", () => {
    expect(decodeTextString("(one \\\ntwo)")).toBe("one two");
  });

  test("reads hex, padding a missing final digit", () => {
    expect(decodeTextString("<48 69 2>")).toBe("Hi ");
  });

  test("maps PDFDocEncoding where it differs from Latin-1", () => {
    expect(decodeTextString("<80A0>")).toBe("\u2022\u20ac");
  });

  test("reads UTF-8 behind its byte order mark", () => {
    expect(decodeTextString("<EFBBBFC3A9>")).toBe("\u00e9");
  });

  test("returns null for anything that is not a string", () => {
    expect(decodeTextString("/Name")).toBeNull();
    expect(decodeTextString("<< /A 1 >>")).toBeNull();
    expect(decodeTextString("(unterminated")).toBeNull();
  });
});
