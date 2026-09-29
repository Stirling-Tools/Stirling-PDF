import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@app/services/processingFolderApi", () => ({
  CLASSIFY_OPERATION: "classify",
  classificationDefaults: (folderId: string) => ({
    folderId,
    enabled: true,
    steps: [],
  }),
  deleteProcessingFolder: vi.fn(),
  fetchMountedFiles: vi.fn().mockResolvedValue([]),
  fetchProcessingFolderRuns: vi.fn().mockResolvedValue([]),
  fetchProcessingFolders: vi.fn(),
  retryMountedFile: vi.fn(),
  revertAllMountedFiles: vi.fn(),
  revertMountedFile: vi.fn(),
  saveProcessingFolder: vi.fn(),
  sweepProcessingFolder: vi.fn(),
}));
vi.mock("@app/hooks/useFileHandler", () => ({
  useFileHandler: () => ({ addFiles: vi.fn() }),
}));
vi.mock("@app/services/processingRunDelivery", () => ({
  currentRunIds: vi.fn().mockResolvedValue(new Set()),
  deliverSweepResults: vi.fn(),
}));

import { createAppQueryClient } from "@app/query/queryClient";
import {
  deleteProcessingFolder,
  fetchProcessingFolders,
  saveProcessingFolder,
  type ProcessingFolder,
} from "@app/services/processingFolderApi";
import { useProcessingFolders } from "@app/hooks/useProcessingFolders";
import type { FolderRecord } from "@app/types/folder";

const listFolders = vi.mocked(fetchProcessingFolders);
const save = vi.mocked(saveProcessingFolder);
const remove = vi.mocked(deleteProcessingFolder);

const FOLDER = { id: "f1", name: "Invoices" } as unknown as FolderRecord;

function record(enabled: boolean): ProcessingFolder {
  return {
    id: "rec-1",
    folderId: "f1",
    directory: null,
    enabled,
    steps: [],
    output: {},
  } as unknown as ProcessingFolder;
}

let api: ReturnType<typeof useProcessingFolders> | null = null;

function Probe() {
  api = useProcessingFolders();
  return (
    <span data-testid="state">
      {api.loading ? "loading" : String(api.anyEnabled)}
    </span>
  );
}

function mount(children: ReactNode) {
  const client = createAppQueryClient();
  return render(
    <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  );
}

beforeEach(() => {
  api = null;
  listFolders.mockReset().mockResolvedValue([record(true)]);
  save.mockReset().mockResolvedValue(record(true));
  remove.mockReset().mockResolvedValue(undefined);
});

it("reads the list once however many rows ask for it", async () => {
  // The files page calls this per folder card and per row.
  mount(
    <>
      <Probe />
      <Probe />
      <Probe />
      <Probe />
      <Probe />
    </>,
  );

  await waitFor(() => expect(listFolders).toHaveBeenCalled());
  await act(async () => {});

  expect(listFolders).toHaveBeenCalledTimes(1);
});

it("reports a load failure without folders, rather than breaking the page", async () => {
  listFolders.mockRejectedValue(new Error("storage off"));
  mount(<Probe />);

  await waitFor(() => expect(api!.loading).toBe(false));
  expect(api!.loadError).toBe("storage off");
  expect(api!.anyEnabled).toBe(false);
});

describe("writes", () => {
  it("carries the re-read with the write rather than after it", async () => {
    mount(<Probe />);
    await waitFor(() => expect(api!.loading).toBe(false));
    const reads = listFolders.mock.calls.length;

    listFolders.mockResolvedValue([record(false)]);
    await act(async () => {
      await api!.disable(FOLDER);
    });

    // The read is already spent when the write resolves; React commits it a tick
    // later, so the count - not the returned state - is what proves it.
    expect(listFolders.mock.calls.length).toBeGreaterThan(reads);
    await waitFor(() => expect(api!.anyEnabled).toBe(false));
  });

  it("refreshes once for a write, not once per mounted row", async () => {
    mount(
      <>
        <Probe />
        <Probe />
        <Probe />
      </>,
    );
    await waitFor(() => expect(api!.loading).toBe(false));
    const reads = listFolders.mock.calls.length;

    await act(async () => {
      await api!.remove(FOLDER);
    });

    expect(listFolders.mock.calls.length).toBe(reads + 1);
  });

  /**
   * Invalidation cancels an in-flight refresh and starts another, deliberately: a
   * read that began before the second write cannot be trusted to show it. So two
   * writes cost two refreshes, and the survivor is the one issued last.
   */
  it("shows the last of two writes issued together", async () => {
    mount(<Probe />);
    await waitFor(() => expect(api!.loading).toBe(false));

    listFolders.mockResolvedValue([record(false)]);
    await act(async () => {
      await Promise.all([api!.disable(FOLDER), api!.remove(FOLDER)]);
    });

    await waitFor(() => expect(api!.anyEnabled).toBe(false));
  });

  it("does not refresh for a sweep, which changes no record", async () => {
    mount(<Probe />);
    await waitFor(() => expect(api!.loading).toBe(false));
    const reads = listFolders.mock.calls.length;

    await act(async () => {
      await api!.sweep(FOLDER);
    });

    expect(listFolders.mock.calls.length).toBe(reads);
  });
});
