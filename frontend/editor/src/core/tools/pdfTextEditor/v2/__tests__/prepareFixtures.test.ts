import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { toLatin1 } from "@app/tools/pdfTextEditor/v2/pdfdoc/bytes";
import { RawPdf } from "@app/tools/pdfTextEditor/v2/pdfdoc/raw";
import { prepareForEditing } from "@app/tools/pdfTextEditor/v2/pdfdoc/prepareForEditing";

// Held to the real corpus, not hand-built fixtures: whatever the load-time
// repair returns must still be the same document.
const FIXTURES = path.resolve(__dirname, "../../../../tests/test-fixtures");

const pdfs = readdirSync(FIXTURES)
  .filter((name) => name.toLowerCase().endsWith(".pdf"))
  .sort();

describe("prepareForEditing over the real fixture corpus", () => {
  it("finds fixtures to check", () => {
    expect(pdfs.length).toBeGreaterThan(5);
  });

  for (const name of pdfs) {
    it(`preserves every page of ${name}`, async () => {
      const original = new Uint8Array(readFileSync(path.join(FIXTURES, name)));
      const prepared = await prepareForEditing(original);

      if (prepared === original) return; // untouched is always correct

      const before = await RawPdf.parse(original);
      const after = await RawPdf.parse(prepared);
      expect(after).not.toBeNull();
      expect(after?.pageNumbers().length).toBe(before?.pageNumbers().length);

      // Every original byte must still be there: the repair only appends.
      expect(prepared.slice(0, original.length)).toEqual(original);

      // And each page's content must still decode to the same operators.
      const pageCount = after?.pageNumbers().length ?? 0;
      for (let i = 0; i < pageCount; i += 1) {
        const oldContent = await before?.pageContent(
          before.pageNumberAt(i) ?? 0,
        );
        const newContent = await after?.pageContent(after.pageNumberAt(i) ?? 0);
        if (!oldContent || !newContent) continue;
        expect(normalise(toLatin1(newContent))).toBe(
          normalise(toLatin1(oldContent)),
        );
      }
    });
  }
});

/** Whitespace between operators is not significant. */
function normalise(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}
