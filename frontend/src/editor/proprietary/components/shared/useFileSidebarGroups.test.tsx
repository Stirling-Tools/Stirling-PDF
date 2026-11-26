import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFileSidebarGroups } from "@editor/components/shared/fileSidebarGrouping";
import type { StirlingFileStub } from "@editor/types/fileContext";

const mocks = vi.hoisted(() => ({
  readStubClassificationLabels: vi.fn(),
  updateFileMetadata: vi.fn(),
}));

vi.mock("@editor/hooks/useClassificationEnabled", () => ({
  useClassificationEnabled: () => true,
}));

// The context value is built once: the backfill effect depends on bumpRevision.
const indexedDb = vi.hoisted(() => ({ bumpRevision: vi.fn() }));

vi.mock("@editor/contexts/IndexedDBContext", () => ({
  useIndexedDB: () => indexedDb,
}));

vi.mock("@editor/services/fileStorage", () => ({
  fileStorage: { updateFileMetadata: mocks.updateFileMetadata },
}));

vi.mock("@editor/services/fileClassification", () => ({
  readStubClassificationLabels: mocks.readStubClassificationLabels,
}));

vi.mock("@editor/components/policies/policyRunStore", () => ({
  hasInFlightPolicyRuns: () => false,
}));

// useSyncExternalStore loops forever on a snapshot that is new on every read.
const noCategories = vi.hoisted(() => []);

vi.mock("@editor/services/fileSidebarCategories", () => ({
  getSidebarCategories: () => noCategories,
  subscribeSidebarCategories: () => () => {},
}));

vi.mock("@editor/components/shared/FileSidebarGroupControls", () => ({
  FileSidebarGroupControls: () => null,
}));

vi.mock("@editor/utils/scheduleIdle", () => ({
  scheduleIdle: (task: () => void) => {
    task();
    return () => {};
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const stub = (id: string, lastModified = 1) =>
  ({ id, lastModified, size: 10, type: "application/pdf" }) as StirlingFileStub;

describe("useFileSidebarGroups label backfill", () => {
  beforeEach(() => {
    mocks.readStubClassificationLabels.mockReset();
    mocks.updateFileMetadata.mockReset().mockResolvedValue(true);
    indexedDb.bumpRevision.mockReset();
  });

  it("reads a file once when stubs change while its read is pending, and keeps the result", async () => {
    const read = deferred<string[] | null>();
    mocks.readStubClassificationLabels.mockReturnValue(read.promise);

    const { rerender } = renderHook(
      ({ stubs }) => useFileSidebarGroups(stubs),
      { initialProps: { stubs: [stub("a")] } },
    );
    rerender({ stubs: [stub("a")] });
    rerender({ stubs: [stub("a")] });
    read.resolve(["invoice"]);

    await waitFor(() => expect(indexedDb.bumpRevision).toHaveBeenCalledOnce());
    expect(mocks.readStubClassificationLabels).toHaveBeenCalledOnce();
    expect(mocks.updateFileMetadata).toHaveBeenCalledWith("a", {
      classificationLabels: ["invoice"],
    });
  });

  it("reads a new version of the same file again", async () => {
    mocks.readStubClassificationLabels.mockResolvedValue(null);

    const { rerender } = renderHook(
      ({ stubs }) => useFileSidebarGroups(stubs),
      { initialProps: { stubs: [stub("a", 1)] } },
    );
    await waitFor(() =>
      expect(mocks.readStubClassificationLabels).toHaveBeenCalledOnce(),
    );
    rerender({ stubs: [stub("a", 2)] });

    await waitFor(() =>
      expect(mocks.readStubClassificationLabels).toHaveBeenCalledTimes(2),
    );
  });
});
