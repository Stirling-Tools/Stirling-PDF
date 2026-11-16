import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createStirlingFile,
  type StirlingFile,
} from "@editor/types/fileContext";
import {
  useAutoLoadFile,
  type EditorLoadState,
} from "@editor/tools/pdfTextEditor/hooks/useAutoLoadFile";

const files = vi.hoisted(() => ({
  selected: [] as StirlingFile[],
  all: [] as StirlingFile[],
}));
vi.mock("@editor/contexts/FileContext", () => ({
  useFileSelection: () => ({ selectedFiles: files.selected }),
  useAllFiles: () => ({ files: files.all }),
}));
vi.mock("@editor/contexts/NavigationContext", () => ({
  useNavigationState: () => ({ selectedTool: "pdfTextEditor" }),
}));
vi.mock("@editor/contexts/ViewerContext", () => ({
  useViewer: () => ({ activeFileId: null }),
}));
beforeEach(() => {
  files.selected = [createStirlingFile(new File(["pdf"], "locked.pdf"))];
  files.all = files.selected;
});
afterEach(cleanup);

it("keeps a cancelled workbench password prompt closed until explicit retry", () => {
  const file = files.selected[0];
  const load = vi.fn(async () => false);
  const choose = vi.fn();
  const initial: EditorLoadState = {
    hasDocument: false,
    loading: false,
    error: null,
    passwordPrompt: null,
  };
  const view = renderHook(
    (editor: EditorLoadState) =>
      useAutoLoadFile(load, choose, file.fileId, false, editor),
    { initialProps: initial },
  );
  expect(load).toHaveBeenCalledOnce();
  view.rerender({
    ...initial,
    passwordPrompt: { fileName: file.name, retry: true },
  });
  act(() => view.result.current.cancel(file));
  view.rerender(initial);
  view.rerender({ ...initial });
  expect(load).toHaveBeenCalledOnce();
  act(() => view.result.current.openFile(file));
  expect(load).toHaveBeenCalledTimes(2);
});

it("allows another selected file to load after cancelling a password prompt", () => {
  const file = files.selected[0];
  const load = vi.fn(async () => false);
  const choose = vi.fn();
  const initial: EditorLoadState = {
    hasDocument: false,
    loading: false,
    error: null,
  };
  const view = renderHook(
    (editor: EditorLoadState) =>
      useAutoLoadFile(load, choose, file.fileId, false, editor),
    { initialProps: initial },
  );
  act(() => view.result.current.cancel(file));
  files.selected = [createStirlingFile(new File(["other"], "other.pdf"))];
  files.all = [...files.all, ...files.selected];
  view.rerender({ ...initial });
  expect(load).toHaveBeenLastCalledWith(files.selected[0]);
  expect(load).toHaveBeenCalledTimes(2);
});

it.each([
  ["fails or asks for a password", false],
  ["opens", true],
])(
  "names the editor after a chosen workbench file only once it %s",
  async (_case, opens) => {
    const file = files.selected[0];
    let finish: (opened: boolean) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const choose = vi.fn();
    const editor: EditorLoadState = {
      hasDocument: true,
      loading: false,
      error: null,
    };
    const view = renderHook(() =>
      useAutoLoadFile(load, choose, null, false, editor),
    );
    act(() => view.result.current.openFile(file));
    expect(load).toHaveBeenCalledWith(file);
    expect(choose).not.toHaveBeenCalled();
    await act(async () => finish(opens));
    if (opens) expect(choose).toHaveBeenCalledWith(file.name, file.fileId);
    else expect(choose).not.toHaveBeenCalled();
  },
);
