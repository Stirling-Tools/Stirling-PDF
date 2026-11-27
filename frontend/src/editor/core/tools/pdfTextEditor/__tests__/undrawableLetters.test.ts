// @vitest-environment node
import { describe, expect, test } from "vitest";
import { InsertTextCommand } from "@editor/tools/pdfTextEditor/commands/InsertTextCommand";
import {
  SetFontFamilyCommand,
  losesLetters,
} from "@editor/tools/pdfTextEditor/commands/SetFontFamilyCommand";
import {
  editorStores,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

servePdfiumWasm();
const { fixture } = editorStores();

describe("a font change on text no available font fully draws", () => {
  test.each([
    ["Plain ✓", "Helvetica-Bold"],
    ["Plain 测", "Times-Bold"],
  ])("%s still moves to %s", async (text, family) => {
    const store = await fixture("paragraph-sample.pdf");
    const insert = new InsertTextCommand({ pageIndex: 0, x: 40, y: 60, text });
    store.dispatch(insert);
    const run = store.document!.page(0).findRun(insert.insertedRunId!)!;

    const change = new SetFontFamilyCommand({
      pageIndex: 0,
      runId: run.id,
      nextFamily: family,
    });
    expect(change.wouldLoseText(store.document!)).toBe(false);
    store.dispatch(change);
    expect([run.fontId, run.text]).toEqual([`base14:${family}`, text]);
  });
});

describe("which lost characters are letters", () => {
  test("a control code read from a page is a glyph it drew, such as a TeX ligature", () => {
    expect(losesLetters(["\x1b"])).toBe(true);
  });

  test("a format character draws nothing", () => {
    expect(losesLetters(["\u200d", "\u00ad"])).toBe(false);
  });
});
