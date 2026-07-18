import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { FileContextProvider } from "@app/contexts/FileContext";
import {
  useAllFiles,
  useFileSelection,
  useStirlingFileStub,
  useFileActions,
} from "@app/contexts/file/fileHooks";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";
import type { FileContextAction } from "@app/types/fileContext";

/**
 * Proves the selector-subscription contract: a consumer re-renders only when
 * the slice it selects changes — a single file's update doesn't re-render
 * other files' consumers, and selection changes don't re-render list consumers.
 */

const stub = (id: string): StirlingFileStub =>
  ({
    id: id as FileId,
    name: `${id}.pdf`,
    type: "application/pdf",
    size: 1,
    lastModified: 0,
  }) as StirlingFileStub;

const renders: Record<string, number> = {};
let dispatchRef: React.Dispatch<FileContextAction> | null = null;

function Controller() {
  const { dispatch } = useFileActions();
  dispatchRef = dispatch;
  return null;
}

function StubWatcher({ fileId }: { fileId: string }) {
  useStirlingFileStub(fileId as FileId);
  renders[`stub-${fileId}`] = (renders[`stub-${fileId}`] ?? 0) + 1;
  return null;
}

function ListWatcher() {
  useAllFiles();
  renders.list = (renders.list ?? 0) + 1;
  return null;
}

function SelectionWatcher() {
  useFileSelection();
  renders.selection = (renders.selection ?? 0) + 1;
  return null;
}

function setup() {
  for (const key of Object.keys(renders)) delete renders[key];
  dispatchRef = null;
  render(
    <MantineProvider>
      <FileContextProvider enableUrlSync={false}>
        <Controller />
        <StubWatcher fileId="a" />
        <StubWatcher fileId="b" />
        <ListWatcher />
        <SelectionWatcher />
      </FileContextProvider>
    </MantineProvider>,
  );
  act(() => {
    dispatchRef!({
      type: "ADD_FILES",
      payload: { stirlingFileStubs: [stub("a"), stub("b")] },
    });
  });
  return { ...renders };
}

describe("file hooks — selector subscriptions", () => {
  it("updating one file re-renders that file's consumer, not the other's", () => {
    const before = setup();
    act(() => {
      dispatchRef!({
        type: "UPDATE_FILE_RECORD",
        payload: { id: "b" as FileId, updates: { name: "renamed.pdf" } },
      });
    });
    expect(renders["stub-b"]).toBeGreaterThan(before["stub-b"]);
    expect(renders["stub-a"]).toBe(before["stub-a"]);
  });

  it("selection changes don't re-render file-list or per-file consumers", () => {
    const before = setup();
    act(() => {
      dispatchRef!({
        type: "SET_SELECTED_FILES",
        payload: { fileIds: ["a" as FileId] },
      });
    });
    expect(renders.selection).toBeGreaterThan(before.selection);
    expect(renders.list).toBe(before.list);
    expect(renders["stub-a"]).toBe(before["stub-a"]);
    expect(renders["stub-b"]).toBe(before["stub-b"]);
  });

  it("file-list changes don't re-render selection-only consumers", () => {
    const before = setup();
    act(() => {
      dispatchRef!({
        type: "UPDATE_FILE_RECORD",
        payload: { id: "a" as FileId, updates: { name: "x.pdf" } },
      });
    });
    expect(renders.selection).toBe(before.selection);
  });
});
