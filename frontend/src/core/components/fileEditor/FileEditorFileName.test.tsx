import React from "react";
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import FileEditorFileName from "@app/components/fileEditor/FileEditorFileName";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

const buildFileStub = (
  overrides: Partial<StirlingFileStub> = {},
): StirlingFileStub => ({
  id: "file-1" as FileId,
  name: "report.pdf",
  type: "application/pdf",
  size: 1024,
  lastModified: 0,
  isLeaf: true,
  originalFileId: "file-1",
  versionNumber: 1,
  ...overrides,
});

const renderName = (file: StirlingFileStub) =>
  render(
    <MantineProvider>
      <FileEditorFileName file={file} />
    </MantineProvider>,
  );

describe("FileEditorFileName (core / web)", () => {
  test.each([
    { name: "not-saved", file: buildFileStub() },
    {
      name: "dirty",
      file: buildFileStub({ localFilePath: "/tmp/report.pdf", isDirty: true }),
    },
    {
      name: "saved",
      file: buildFileStub({ localFilePath: "/tmp/report.pdf", isDirty: false }),
    },
  ])("does not render a save indicator ($name)", ({ file }) => {
    renderName(file);

    expect(screen.queryByLabelText("fileNotSavedToDisk")).toBeNull();
    expect(screen.queryByLabelText("unsavedChanges")).toBeNull();
    expect(screen.queryByLabelText("fileSavedToDisk")).toBeNull();
  });

  test("renders the filename", () => {
    renderName(buildFileStub({ name: "invoice.pdf" }));
    expect(screen.getByText("invoice.pdf")).toBeInTheDocument();
  });
});
