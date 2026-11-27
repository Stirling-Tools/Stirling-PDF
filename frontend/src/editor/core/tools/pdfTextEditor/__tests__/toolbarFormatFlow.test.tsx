import { act, renderHook } from "@testing-library/react";
import { beforeAll, beforeEach, expect, test, vi } from "vitest";
import { degrees, PDFDocument } from "@cantoo/pdf-lib";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));

import { allowConsole } from "@editor/tests/failOnConsole";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { InsertTextCommand } from "@editor/tools/pdfTextEditor/commands/InsertTextCommand";
import { ensurePageRead } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import { useToolbarController } from "@editor/tools/pdfTextEditor/hooks/useToolbarController";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";
import {
  editorStores,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

servePdfiumWasm();
const { storeWith } = editorStores();

const NO_CANVAS = /HTMLCanvasElement's getContext\(\) method/;

beforeAll(() => {
  get.mockRejectedValue(new Error("no server fonts"));
});
beforeEach(() => allowConsole.error(NO_CANVAS));

async function twoLinesOn(rotate: number) {
  const pdf = await PDFDocument.create();
  pdf.addPage([400, 300]).setRotation(degrees(rotate));
  pdf.addPage([400, 300]);
  const store = await storeWith(await pdf.save());
  ensurePageRead(store, 1);
  store.publishPages(
    [0, 1].map(
      (pageIndex) =>
        ({
          pageIndex,
          revision: -1,
          runs: [],
          images: [],
          shapes: [],
          annotations: [],
          rules: [],
        }) as unknown as PageSnapshot,
    ),
  );
  const insert = new InsertTextCommand({
    pageIndex: 0,
    x: 40,
    y: 120,
    text: "Line one",
  });
  store.dispatch(insert);
  const runId = insert.insertedRunId!;
  store.dispatch(
    new EditTextCommand({
      pageIndex: 0,
      runId,
      nextText: "Line one\nLine two",
    }),
  );
  store.selection.selectOne(runId);
  return { store, runId };
}

function controller(store: EditorStore) {
  return renderHook(() =>
    useToolbarController(store, store.getState(), store.selection.value),
  ).result.current;
}

test("one undo takes back a font size change together with the lines it pushed onto the next page", async () => {
  const { store, runId } = await twoLinesOn(0);
  const run = store.document!.page(0).findRun(runId)!;
  const size = run.fontSize;

  const { onChangeFontSize } = controller(store);
  await act(() => onChangeFontSize(72));

  expect(store.document!.page(1).runs.map((r) => r.text)).toEqual(["Line two"]);

  act(() => store.undo());

  expect(store.document!.page(1).runs).toHaveLength(0);
  const restored = store.document!.page(0).findRun(runId)!;
  expect(restored.text).toBe("Line one\nLine two");
  expect(restored.fontSize).toBe(size);
});

test("lines of a paragraph on a turned page are not offered for alignment", async () => {
  const upright = await twoLinesOn(0);
  const turned = await twoLinesOn(90);

  expect(controller(upright.store).canAlignLines).toBe(true);
  expect(controller(turned.store).canAlignLines).toBe(false);
});
