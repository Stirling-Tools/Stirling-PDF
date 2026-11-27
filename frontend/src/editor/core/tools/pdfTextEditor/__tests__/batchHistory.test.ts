import { describe, expect, test, vi } from "vitest";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import {
  editorStores,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

servePdfiumWasm();
const { fixture } = editorStores();

const fakeDoc = {} as unknown as EditorDocument;

function step(type: string, key: string | null = null) {
  const revert = vi.fn();
  const cmd: Command = {
    type,
    apply: vi.fn(),
    revert,
    coalesceKey: () => key,
  };
  return { cmd, revert };
}

describe("nested history batches", () => {
  test("an inner merge keeps the outer batch from swallowing the edit before it", () => {
    const history = new HistoryStack();
    const a = step("a");
    const b = step("b");
    const c = step("c");
    const d = step("d");
    history.execute(a.cmd, fakeDoc);
    const outer = history.mark;
    history.execute(b.cmd, fakeDoc);
    const inner = history.mark;
    history.execute(c.cmd, fakeDoc);
    history.execute(d.cmd, fakeDoc);
    history.mergeSince(inner);
    history.mergeSince(outer);

    expect(history.size().undo).toBe(2);
    history.undo(fakeDoc);
    expect(b.revert).toHaveBeenCalledOnce();
    expect(c.revert).toHaveBeenCalledOnce();
    expect(d.revert).toHaveBeenCalledOnce();
    expect(a.revert).not.toHaveBeenCalled();
  });

  test("a single batch is still one undo step", () => {
    const history = new HistoryStack();
    history.execute(step("a").cmd, fakeDoc);
    const mark = history.mark;
    history.execute(step("b").cmd, fakeDoc);
    history.execute(step("c").cmd, fakeDoc);
    history.mergeSince(mark);
    expect(history.size().undo).toBe(2);
  });
});

describe("store batches", () => {
  test("a batch's first edit does not join the edit made before it", async () => {
    const store = await fixture("paragraph-sample.pdf");
    const a = step("a", "typing");
    const b = step("b", "typing");
    const c = step("c");
    store.dispatch(a.cmd);
    store.batchNow(() => {
      store.dispatch(b.cmd);
      store.dispatch(c.cmd);
    });

    expect(store.history.size().undo).toBe(2);
    store.history.undo(store.document!);
    expect(b.revert).toHaveBeenCalledOnce();
    expect(c.revert).toHaveBeenCalledOnce();
    expect(a.revert).not.toHaveBeenCalled();
  });

  test("an async batch's first edit does not join the edit made before it", async () => {
    const store = await fixture("paragraph-sample.pdf");
    const a = step("a", "typing");
    const b = step("b", "typing");
    const c = step("c", "typing");
    store.dispatch(a.cmd);
    await store.batch(async () => {
      store.dispatch(b.cmd);
      store.dispatch(c.cmd);
    });

    expect(store.history.size().undo).toBe(2);
    store.history.undo(store.document!);
    expect(a.revert).not.toHaveBeenCalled();
    expect(b.revert).toHaveBeenCalledOnce();
    expect(c.revert).toHaveBeenCalledOnce();
  });
});
