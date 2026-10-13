import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useSignaturePreviewHistory } from "@app/hooks/signing/useSignaturePreviewHistory";
import type { SignaturePreview } from "@app/components/viewer/viewerTypes";

const signature: SignaturePreview = {
  id: "draft",
  pageIndex: 0,
  x: 0.1,
  y: 0.2,
  width: 0.3,
  height: 0.1,
  signatureData: "data:image/png;base64,AA==",
  signatureType: "canvas",
};

it("undoes and redoes adding and deleting a signature, discarding redo after a new edit", () => {
  const { result } = renderHook(() => useSignaturePreviewHistory());
  act(() => result.current.change([signature]));
  act(() => result.current.change([]));
  act(() => result.current.undo());
  expect(result.current.previews).toEqual([signature]);
  act(() => result.current.undo());
  expect(result.current.previews).toEqual([]);
  expect(result.current.canUndo).toBe(false);
  act(() => result.current.redo());
  expect(result.current.previews).toEqual([signature]);
  act(() => result.current.change([{ ...signature, pageIndex: 1 }]));
  expect(result.current.canRedo).toBe(false);
});

it("undoes a whole drag or resize in one step, retaining edits on other pages", () => {
  const initial = [signature, { ...signature, id: "page-two", pageIndex: 1 }];
  const { result } = renderHook(() => useSignaturePreviewHistory(initial));
  for (let step = 1; step <= 12; step++) {
    act(() =>
      result.current.change(
        [
          { ...signature, x: 0.1 + step / 100, width: 0.3 + step / 100 },
          initial[1],
        ],
        true,
      ),
    );
  }
  const moved = result.current.previews;
  expect(result.current.canUndo).toBe(false);
  act(() => result.current.change(moved));
  act(() => result.current.undo());
  expect(result.current.previews).toEqual(initial);
  expect(result.current.canUndo).toBe(false);
  act(() => result.current.redo());
  expect(result.current.previews).toEqual(moved);
});

it("resets history after submission and does not record a cancelled gesture", () => {
  const initial = [signature];
  const { result } = renderHook(() => useSignaturePreviewHistory(initial));
  act(() => result.current.change([{ ...signature, x: 0.5 }], true));
  act(() => result.current.change(initial));
  expect(result.current.previews).toEqual(initial);
  expect(result.current.canUndo).toBe(false);
  act(() => result.current.change([]));
  act(() => result.current.reset([]));
  act(() => result.current.undo());
  expect(result.current.previews).toEqual([]);
  expect(result.current.canUndo || result.current.canRedo).toBe(false);
});
