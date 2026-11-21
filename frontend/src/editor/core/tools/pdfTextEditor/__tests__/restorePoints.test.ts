// @vitest-environment node
import { expect, test, vi } from "vitest";
import { InsertTextCommand } from "@editor/tools/pdfTextEditor/commands/InsertTextCommand";
import {
  editorStores,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

servePdfiumWasm();
const { fixture } = editorStores();

function point() {
  return {
    undo: vi.fn(async () => true),
    redo: vi.fn(async () => true),
  };
}

test("a page change undone can be redone, until a new edit is made", async () => {
  const store = await fixture("paragraph-sample.pdf");
  const change = point();
  store.pushRestorePoint(change);

  store.undo();
  await vi.waitFor(() => expect(store.canRedo).toBe(true));
  expect(change.undo).toHaveBeenCalledOnce();

  store.redo();
  await vi.waitFor(() => expect(change.redo).toHaveBeenCalledOnce());
  expect(store.canRedo).toBe(false);

  store.pushRestorePoint(change);
  store.undo();
  await vi.waitFor(() => expect(store.canRedo).toBe(true));
  store.dispatch(
    new InsertTextCommand({ pageIndex: 0, x: 40, y: 60, text: "New" }),
  );
  expect(store.canRedo).toBe(false);
});

test("a redo that could not be made stays to be tried again", async () => {
  const store = await fixture("paragraph-sample.pdf");
  const change = {
    undo: vi.fn(async () => true),
    redo: vi.fn(async () => false),
  };
  store.pushRestorePoint(change);
  store.undo();
  await vi.waitFor(() => expect(store.canRedo).toBe(true));

  store.redo();
  await vi.waitFor(() => expect(change.redo).toHaveBeenCalledOnce());
  expect(store.canRedo).toBe(true);
});
