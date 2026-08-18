import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { FileContextProvider } from "@app/contexts/FileContext";
import { useFileActions } from "@app/contexts/file/fileHooks";
import type { FileContextActions } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

/**
 * Which removals tell the server a document is gone.
 *
 * `removeFiles` serves two jobs the caller distinguishes only by `deleteFromStorage`: deleting a
 * document, and taking one out of the workbench. Reporting both closes the user's own failure
 * notifications as they open and close files, which is not a decision they made.
 */

const reportFilesRemoved = vi.fn();
vi.mock("@app/services/failureReporting", () => ({
  reportFilesRemoved: (fileIds: string[]) => reportFilesRemoved(fileIds),
  reportToolFailure: vi.fn(),
}));

// A real delete reaches IndexedDB, which jsdom has none of. Only the delete itself is stubbed: the
// point of these tests is which branch runs, so the branch has to be allowed to finish.
vi.mock("@app/services/fileStorage", () => ({
  // FileContext subscribes to this to drop files whose bytes are unreadable.
  onRecordUnreadable: () => () => {},
  fileStorage: {
    init: vi.fn().mockResolvedValue(undefined),
    deleteMultipleStirlingFiles: vi.fn().mockResolvedValue(undefined),
    getAllStirlingFileStubs: vi.fn().mockResolvedValue([]),
  },
}));

const FILE_ID = "f-1" as FileId;

let actionsRef: FileContextActions | null = null;

function Controller() {
  actionsRef = useFileActions().actions;
  return null;
}

function setup() {
  render(
    <MantineProvider>
      <FileContextProvider>
        <Controller />
      </FileContextProvider>
    </MantineProvider>,
  );
}

beforeEach(() => {
  reportFilesRemoved.mockReset();
  actionsRef = null;
});

describe("removeFiles and the failure queue", () => {
  it("tells the server when a document is actually deleted", async () => {
    setup();

    await act(async () => {
      await actionsRef?.removeFiles([FILE_ID], true);
    });

    expect(reportFilesRemoved).toHaveBeenCalledWith([FILE_ID]);
  });

  it("says nothing when the file is only closed in the workbench", async () => {
    // Closing a tab, unchecking it in the file manager, swapping which files are open: all of them
    // pass false and leave the document on the device, so its failures still need attention.
    setup();

    await act(async () => {
      await actionsRef?.removeFiles([FILE_ID], false);
    });

    expect(reportFilesRemoved).not.toHaveBeenCalled();
  });

  it("treats an unspecified removal as a delete, the way the storage path does", async () => {
    // Same default as the IndexedDB branch below it: absent means delete, only an explicit false
    // means keep.
    setup();

    await act(async () => {
      await actionsRef?.removeFiles([FILE_ID]);
    });

    expect(reportFilesRemoved).toHaveBeenCalledWith([FILE_ID]);
  });
});
