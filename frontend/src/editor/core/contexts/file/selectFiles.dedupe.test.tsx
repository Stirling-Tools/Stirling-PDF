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

// Selection updates can land in one React batch, so each add must merge in the
// reducer instead of replacing selections read from an earlier render.

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

function stub(id: string): StirlingFileStub {
  return {
    id: id as FileId,
    name: `${id}.pdf`,
    type: "application/pdf",
    size: 8,
    lastModified: 0,
  } as StirlingFileStub;
}

const FIRST = stub("a");
const SECOND = stub("b");

let actions: FileContextActions | null = null;
let selectedFileIds: FileId[] = [];

function Controller() {
  actions = useFileActions().actions;
  selectedFileIds = useFileSelection().selectedFileIds;
  return null;
}

describe("selecting added files", () => {
  it("merges back-to-back additions and lists an open file once", async () => {
    render(
      <MantineProvider>
        <FileContextProvider enableUrlSync={false}>
          <Controller />
        </FileContextProvider>
      </MantineProvider>,
    );

    await act(async () => {
      await Promise.all([
        actions?.addStirlingFileStubs([FIRST], { selectFiles: true }),
        actions?.addStirlingFileStubs([SECOND], { selectFiles: true }),
      ]);
    });
    expect(selectedFileIds).toEqual([FIRST.id, SECOND.id]);

    await act(async () => {
      await actions?.addStirlingFileStubs([FIRST], { selectFiles: true });
    });
    expect(selectedFileIds).toEqual([FIRST.id, SECOND.id]);
  });
});
