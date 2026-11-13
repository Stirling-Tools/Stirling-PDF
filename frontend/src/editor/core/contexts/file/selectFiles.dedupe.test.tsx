import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { FileContextProvider } from "@editor/contexts/FileContext";
import {
  useFileActions,
  useFileSelection,
} from "@editor/contexts/file/fileHooks";
import type {
  FileContextActions,
  StirlingFileStub,
} from "@editor/types/fileContext";
import type { FileId } from "@editor/types/file";

// A file already in the workbench comes back from the add, so selecting what
// was added must not list it twice.

vi.mock("@editor/services/fileStorage", async () => {
  const { createStirlingFile } = await import("@editor/types/fileContext");
  return {
    onRecordUnreadable: () => () => {},
    fileStorage: {
      init: vi.fn().mockResolvedValue(undefined),
      getAllStirlingFileStubs: vi.fn().mockResolvedValue([]),
      getStirlingFile: vi.fn(async (id: FileId) =>
        createStirlingFile(
          new File(["%PDF-1.7"], `${id}.pdf`, { type: "application/pdf" }),
          id,
        ),
      ),
    },
  };
});
vi.mock("@editor/utils/thumbnailUtils", () => ({
  generateThumbnailPairWithMetadata: () => new Promise(() => {}),
}));

const STUB = {
  id: "a" as FileId,
  name: "a.pdf",
  type: "application/pdf",
  size: 8,
  lastModified: 0,
} as StirlingFileStub;

let actions: FileContextActions | null = null;
let selectedFileIds: FileId[] = [];

function Controller() {
  actions = useFileActions().actions;
  selectedFileIds = useFileSelection().selectedFileIds;
  return null;
}

describe("selecting added files", () => {
  it("lists a file that was already open once", async () => {
    render(
      <MantineProvider>
        <FileContextProvider enableUrlSync={false}>
          <Controller />
        </FileContextProvider>
      </MantineProvider>,
    );

    await act(async () => {
      await actions?.addStirlingFileStubs([STUB], { selectFiles: true });
    });
    expect(selectedFileIds).toEqual([STUB.id]);

    await act(async () => {
      await actions?.addStirlingFileStubs([STUB], { selectFiles: true });
    });
    expect(selectedFileIds).toEqual([STUB.id]);
  });
});
