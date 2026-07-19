import { describe, it, expect, vi, afterEach } from "vitest";
import { withReducerIdentityGuard } from "@app/contexts/file/FileReducer";
import type {
  FileContextState,
  FileContextAction,
  StirlingFileStub,
} from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

const stub = (id: string): StirlingFileStub =>
  ({ id: id as FileId, name: `${id}.pdf` }) as StirlingFileStub;

function baseState(): FileContextState {
  return {
    files: { ids: ["a" as FileId], byId: { ["a" as FileId]: stub("a") } },
    pinnedFiles: new Set<FileId>(),
    ui: {
      selectedFileIds: [],
      selectedPageNumbers: [],
      isProcessing: false,
      processingProgress: 0,
      hasUnsavedChanges: false,
      errorFileIds: [],
    },
  };
}

const guardErrors = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls.filter((a) => String(a[0]).includes("[FileReducer]"));

afterEach(() => vi.restoreAllMocks());

describe("withReducerIdentityGuard", () => {
  it("warns when a slice is reallocated but unchanged", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Bad reducer: rebuilds `files` (new ref) with identical contents.
    const guarded = withReducerIdentityGuard((s) => ({
      ...s,
      files: { ids: [...s.files.ids], byId: { ...s.files.byId } },
    }));
    guarded(baseState(), { type: "NOOP" } as unknown as FileContextAction);
    expect(guardErrors(spy)).toHaveLength(1);
    expect(String(guardErrors(spy)[0][0])).toContain("state.files");
  });

  it("stays quiet when a slice genuinely changes", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const guarded = withReducerIdentityGuard((s) => ({
      ...s,
      files: {
        ids: [...s.files.ids, "b" as FileId],
        byId: { ...s.files.byId, ["b" as FileId]: stub("b") },
      },
    }));
    guarded(baseState(), { type: "NOOP" } as unknown as FileContextAction);
    expect(guardErrors(spy)).toHaveLength(0);
  });

  it("stays quiet when the reducer returns the same state reference", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const guarded = withReducerIdentityGuard((s) => s);
    const state = baseState();
    expect(
      guarded(state, { type: "NOOP" } as unknown as FileContextAction),
    ).toBe(state);
    expect(guardErrors(spy)).toHaveLength(0);
  });

  it("flags a needless ui reallocation", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const guarded = withReducerIdentityGuard((s) => ({
      ...s,
      ui: { ...s.ui },
    }));
    guarded(baseState(), { type: "NOOP" } as unknown as FileContextAction);
    expect(String(guardErrors(spy)[0][0])).toContain("state.ui");
  });
});
