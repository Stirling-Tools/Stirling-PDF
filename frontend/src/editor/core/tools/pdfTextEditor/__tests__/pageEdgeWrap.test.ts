// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  collectMemberPtrs,
  measureObjSpanPt,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { ReflowWrapCommand } from "@editor/tools/pdfTextEditor/commands/ReflowWrapCommand";
import { SetFontFamilyCommand } from "@editor/tools/pdfTextEditor/commands/SetFontFamilyCommand";
import { SetFontSizeCommand } from "@editor/tools/pdfTextEditor/commands/SetFontSizeCommand";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  editorStores,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

servePdfiumWasm();
const { fixture } = editorStores();

async function body() {
  const store = await fixture("paragraph-sample.pdf");
  const page = store.document!.page(0);
  const run = page.runs.find((r) => r.text.startsWith("First line"))!;
  return { store, page, run, text: run.text };
}

function inkRight(store: EditorStore, runId: string): number {
  const run = store.document!.page(0).findRun(runId)!;
  return measureObjSpanPt(store.document!.module, collectMemberPtrs(run))!
    .right;
}

function pageRight(store: EditorStore): number {
  return store.document!.page(0).display.cropRight;
}

describe("text kept inside the page", () => {
  test.each<[string, (runId: string, fontSize: number) => Command]>([
    [
      "a larger size",
      (runId, fontSize) =>
        new SetFontSizeCommand({ pageIndex: 0, runId, nextSize: fontSize * 3 }),
    ],
    [
      "a wider font",
      (runId) =>
        new SetFontFamilyCommand({
          pageIndex: 0,
          runId,
          nextFamily: "Courier",
        }),
    ],
  ])("%s wraps lines that would cross the right edge", async (_, change) => {
    const { store, run, text } = await body();
    store.dispatch(change(run.id, run.fontSize));

    expect(inkRight(store, run.id)).toBeLessThanOrEqual(pageRight(store) + 0.5);
    expect(run.text.replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " "));

    store.undo();
    expect(run.text).toBe(text);
  });

  test("a narrower width wraps lines each drawn as one object", async () => {
    const { store, run, text } = await body();
    const left = run.bounds.x;
    store.dispatch(
      new ReflowWrapCommand({
        pageIndex: 0,
        runId: run.id,
        maxWidthPt: 150,
        explicit: true,
      }),
    );

    expect(inkRight(store, run.id)).toBeLessThanOrEqual(left + 150.5);
    expect(run.text.split("\n").length).toBeGreaterThan(
      text.split("\n").length,
    );

    store.undo();
    expect(run.text).toBe(text);
  });
});
