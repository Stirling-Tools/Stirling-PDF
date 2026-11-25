import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useEditorStore } from "@editor/tools/pdfTextEditor/hooks/useEditorStore";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";

let store: EditorStore | null = null;
let closeFirst: () => void = () => {};
let closeAll: () => void = () => {};

function Owner() {
  store = useEditorStore().store;
  return null;
}

function Handover() {
  const [firstOpen, setFirstOpen] = useState(true);
  const [open, setOpen] = useState(true);
  closeFirst = () => setFirstOpen(false);
  closeAll = () => setOpen(false);
  if (!open) return null;
  return (
    <>
      {firstOpen && <Owner />}
      <Owner />
    </>
  );
}

afterEach(() => vi.useRealTimers());

describe("useEditorStore", () => {
  it("keeps the document while another owner is still mounted, and frees it after the last", () => {
    vi.useFakeTimers();
    render(<Handover />);
    const clear = vi.spyOn(store!, "clearDocument");

    act(() => closeFirst());
    act(() => vi.advanceTimersByTime(5000));
    expect(clear).not.toHaveBeenCalled();

    act(() => closeAll());
    act(() => vi.advanceTimersByTime(5000));
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
