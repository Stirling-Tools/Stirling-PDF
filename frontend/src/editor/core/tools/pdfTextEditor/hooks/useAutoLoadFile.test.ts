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
const viewer = vi.hoisted(() => ({
  activeFileId: null as string | null,
  setActiveFileId: vi.fn(),
}));
vi.mock("@editor/contexts/FileContext", () => ({
  useFileSelection: () => ({ selectedFiles: files.selected }),
  useAllFiles: () => ({ files: files.all }),
}));
vi.mock("@editor/contexts/NavigationContext", () => ({
  useNavigationState: () => ({ selectedTool: "pdfTextEditor" }),
}));
vi.mock("@editor/contexts/ViewerContext", () => ({
  useViewer: () => viewer,
}));

const closed: EditorLoadState = {
  hasDocument: false,
  loading: false,
  error: null,
  dirty: false,
  passwordPrompt: null,
};
const open: EditorLoadState = { ...closed, hasDocument: true };

beforeEach(() => {
  files.selected = [createStirlingFile(new File(["pdf"], "first.pdf"))];
  files.all = files.selected;
  viewer.activeFileId = null;
  viewer.setActiveFileId.mockReset();
});
afterEach(cleanup);

function render(currentFileId: string | null, editor: EditorLoadState) {
  const load = vi.fn();
  const view = renderHook(
    ({ id, state }: { id: string | null; state: EditorLoadState }) =>
      useAutoLoadFile(
        load,
        vi.fn(),
        id as StirlingFile["fileId"] | null,
        false,
        state,
      ),
    { initialProps: { id: currentFileId, state: editor } },
  );
  return { load, view };
}

it("keeps a cancelled password prompt closed", () => {
  const file = files.selected[0];
  const { load, view } = render(file.fileId, closed);
  expect(load).toHaveBeenCalledOnce();
  view.rerender({
    id: file.fileId,
    state: { ...closed, passwordPrompt: { fileName: file.name, retry: true } },
  });
  act(() => view.result.current.cancel(file));
  view.rerender({ id: file.fileId, state: closed });
  view.rerender({ id: file.fileId, state: { ...closed } });
  expect(load).toHaveBeenCalledOnce();
});

it("allows another selected file to load after cancelling a password prompt", () => {
  const file = files.selected[0];
  const { load, view } = render(file.fileId, closed);
  act(() => view.result.current.cancel(file));
  files.selected = [createStirlingFile(new File(["other"], "other.pdf"))];
  files.all = [...files.all, ...files.selected];
  view.rerender({ id: file.fileId, state: { ...closed } });
  expect(load).toHaveBeenLastCalledWith(files.selected[0]);
  expect(load).toHaveBeenCalledTimes(2);
});

it("follows the active file to another document", () => {
  const first = files.selected[0];
  const second = createStirlingFile(new File(["two"], "second.pdf"));
  files.all = [first, second];
  viewer.activeFileId = first.fileId;
  const { load, view } = render(first.fileId, closed);
  view.rerender({ id: first.fileId, state: open });
  expect(load).toHaveBeenCalledOnce();

  viewer.activeFileId = second.fileId;
  view.rerender({ id: first.fileId, state: { ...open } });
  expect(load).toHaveBeenLastCalledWith(second);
});

it("asks before leaving unsaved edits, and moves the viewer back on cancel", () => {
  const first = files.selected[0];
  const second = createStirlingFile(new File(["two"], "second.pdf"));
  files.all = [first, second];
  viewer.activeFileId = first.fileId;
  const { load, view } = render(first.fileId, closed);
  view.rerender({ id: first.fileId, state: { ...open, dirty: true } });

  viewer.activeFileId = second.fileId;
  view.rerender({ id: first.fileId, state: { ...open, dirty: true } });
  expect(load).toHaveBeenCalledOnce();
  expect(view.result.current.pendingSwitch).toBe(second);

  act(() => view.result.current.cancelSwitch());
  expect(view.result.current.pendingSwitch).toBeNull();
  expect(viewer.setActiveFileId).toHaveBeenCalledWith(first.fileId);
  expect(load).toHaveBeenCalledOnce();
});

it("opens the pending file once its unsaved edits are dropped", () => {
  const first = files.selected[0];
  const second = createStirlingFile(new File(["two"], "second.pdf"));
  files.all = [first, second];
  viewer.activeFileId = first.fileId;
  const { load, view } = render(first.fileId, closed);
  viewer.activeFileId = second.fileId;
  view.rerender({ id: first.fileId, state: { ...open, dirty: true } });

  act(() => view.result.current.confirmSwitch());
  expect(load).toHaveBeenLastCalledWith(second);
});

it("ignores selection changes while a document is open", () => {
  const first = files.selected[0];
  const { load, view } = render(first.fileId, closed);
  view.rerender({ id: first.fileId, state: open });

  files.selected = [createStirlingFile(new File(["other"], "other.pdf"))];
  files.all = [first, ...files.selected];
  view.rerender({ id: first.fileId, state: { ...open } });
  expect(load).toHaveBeenCalledOnce();
});
