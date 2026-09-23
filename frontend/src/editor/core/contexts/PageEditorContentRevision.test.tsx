import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import type { FileId, StirlingFileStub } from "@app/types/fileContext";

const fileState = {
  state: {
    files: {
      ids: [] as FileId[],
      byId: {} as Record<FileId, Partial<StirlingFileStub>>,
    },
  },
};

vi.mock("@app/contexts/FileContext", () => ({
  useFileActions: () => ({ actions: {} }),
  useFileState: () => fileState,
}));

vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationState: () => ({ currentMode: "pageEditor" }),
}));

const { PageEditorProvider, usePageEditor } =
  await import("@app/contexts/PageEditorContext");

const stub = (size: number, lastModified: number) =>
  ({ size, lastModified }) as Partial<StirlingFileStub>;

const setFiles = (entries: [string, Partial<StirlingFileStub>][]) => {
  fileState.state = {
    files: {
      ids: entries.map(([id]) => id as FileId),
      byId: Object.fromEntries(entries) as Record<
        FileId,
        Partial<StirlingFileStub>
      >,
    },
  };
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <PageEditorProvider>{children}</PageEditorProvider>
);

describe("PageEditorContext contentRevision", () => {
  beforeEach(() => setFiles([["A", stub(100, 1)]]));

  it("does not bump when another file is added", () => {
    const view = renderHook(() => usePageEditor(), { wrapper });
    const before = view.result.current.contentRevision;

    act(() => {
      setFiles([
        ["A", stub(100, 1)],
        ["B", stub(200, 2)],
      ]);
      view.rerender();
    });

    expect(view.result.current.contentRevision).toBe(before);
  });

  it("does not bump when a file is removed", () => {
    setFiles([
      ["A", stub(100, 1)],
      ["B", stub(200, 2)],
    ]);
    const view = renderHook(() => usePageEditor(), { wrapper });
    const before = view.result.current.contentRevision;

    act(() => {
      setFiles([["A", stub(100, 1)]]);
      view.rerender();
    });

    expect(view.result.current.contentRevision).toBe(before);
  });

  it("bumps when the bytes behind an open file are replaced", () => {
    const view = renderHook(() => usePageEditor(), { wrapper });
    const before = view.result.current.contentRevision;

    act(() => {
      setFiles([["A", stub(555, 9)]]);
      view.rerender();
    });

    expect(view.result.current.contentRevision).toBe(before + 1);
  });

  it("still bumps on a replacement that arrives alongside an addition", () => {
    const view = renderHook(() => usePageEditor(), { wrapper });
    const before = view.result.current.contentRevision;

    act(() => {
      setFiles([
        ["A", stub(555, 9)],
        ["B", stub(200, 2)],
      ]);
      view.rerender();
    });

    expect(view.result.current.contentRevision).toBe(before + 1);
  });
});
