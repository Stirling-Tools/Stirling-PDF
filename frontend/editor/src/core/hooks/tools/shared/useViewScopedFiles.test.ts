import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { initialFileContextState } from "@app/contexts/file/FileReducer";
import type { FileContextState, FileId } from "@app/types/fileContext";

const mockViewer = { activeFileIndex: 0 };
const mockNavigation = { workbench: "viewer" };
const mockFiles: { files: unknown[]; fileStubs: unknown[] } = {
  files: [],
  fileStubs: [],
};
let mockPolicyBlocks: Record<FileId, string> = {};

vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => mockViewer,
}));

vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationState: () => mockNavigation,
}));

vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => mockFiles,
  useFileSelector: <T>(selector: (state: FileContextState) => T) =>
    selector({
      ...initialFileContextState,
      ui: { ...initialFileContextState.ui, policyBlocks: mockPolicyBlocks },
    }),
}));

import {
  useViewScopedFiles,
  useViewScopedFileStubs,
} from "@app/hooks/tools/shared/useViewScopedFiles";

const file = (id: string) => ({ fileId: id, name: `${id}.pdf` });
const stub = (id: string) => ({
  id,
  name: `${id}.pdf`,
  thumbnailUrl: `${id}.png`,
});

function setState(opts: {
  workbench?: string;
  activeFileIndex?: number;
  files?: unknown[];
  fileStubs?: unknown[];
  policyBlocks?: Record<FileId, string>;
}) {
  mockNavigation.workbench = opts.workbench ?? "viewer";
  mockViewer.activeFileIndex = opts.activeFileIndex ?? 0;
  mockFiles.files = opts.files ?? [];
  mockFiles.fileStubs = opts.fileStubs ?? [];
  mockPolicyBlocks = opts.policyBlocks ?? {};
}

describe("useViewScopedFileStubs", () => {
  it("never substitutes a usable file for a blocked file open in the viewer", () => {
    setState({
      files: [file("a"), file("b")],
      fileStubs: [stub("a"), stub("b")],
      policyBlocks: { ["a" as FileId]: "security" },
    });
    const { result, rerender } = renderHook(() => useViewScopedFileStubs());
    expect(result.current).toEqual([]);
    mockViewer.activeFileIndex = 1;
    rerender();
    expect(result.current.map((s) => s.id)).toEqual(["b"]);
  });

  it("follows the viewer's active file rather than the first loaded one", () => {
    setState({
      files: [file("a"), file("b"), file("c")],
      fileStubs: [stub("a"), stub("b"), stub("c")],
      activeFileIndex: 2,
    });

    const { result } = renderHook(() => useViewScopedFileStubs());

    expect(result.current.map((s) => s.id)).toEqual(["c"]);
  });

  it("re-resolves when the viewer switches files", () => {
    setState({
      files: [file("a"), file("b")],
      fileStubs: [stub("a"), stub("b")],
      activeFileIndex: 0,
    });

    const { result, rerender } = renderHook(() => useViewScopedFileStubs());
    expect(result.current.map((s) => s.id)).toEqual(["a"]);

    setState({
      files: [file("a"), file("b")],
      fileStubs: [stub("a"), stub("b")],
      activeFileIndex: 1,
    });
    rerender();

    expect(result.current.map((s) => s.id)).toEqual(["b"]);
  });

  it("matches by id, not position, when the two lists are out of step", () => {
    // A stub exists before its bytes load, so the stub list can be longer than
    // (and offset from) the file list.
    setState({
      files: [file("b")],
      fileStubs: [stub("a"), stub("b")],
      activeFileIndex: 0,
    });

    const { result } = renderHook(() => useViewScopedFileStubs());

    expect(result.current.map((s) => s.id)).toEqual(["b"]);
  });

  it("returns every stub outside the viewer, mirroring useViewScopedFiles", () => {
    setState({
      workbench: "fileEditor",
      files: [file("a"), file("b")],
      fileStubs: [stub("a"), stub("b")],
    });

    const stubs = renderHook(() => useViewScopedFileStubs()).result.current;
    const files = renderHook(() => useViewScopedFiles()).result.current;

    expect(stubs.map((s) => s.id)).toEqual(["a", "b"]);
    expect(stubs).toHaveLength(files.length);
  });

  it("drops stubs with no loaded file instead of returning undefined holes", () => {
    setState({
      workbench: "fileEditor",
      files: [file("a")],
      fileStubs: [stub("a"), stub("orphan")],
    });

    const { result } = renderHook(() => useViewScopedFileStubs());

    expect(result.current.map((s) => s.id)).toEqual(["a"]);
  });
});
