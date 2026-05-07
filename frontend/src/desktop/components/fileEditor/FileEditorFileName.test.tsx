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

describe("FileEditorFileName (desktop)", () => {
  test("renders red 'not saved' indicator when file has no local path", () => {
    renderName(buildFileStub());

    const indicator = screen.getByLabelText("fileNotSavedToDisk");
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveStyle({
      backgroundColor: "var(--mantine-color-red-6)",
    });
    expect(screen.queryByLabelText("unsavedChanges")).toBeNull();
    expect(screen.queryByLabelText("fileSavedToDisk")).toBeNull();
  });

  test("renders yellow 'unsaved changes' indicator when file is dirty", () => {
    renderName(
      buildFileStub({ localFilePath: "/tmp/report.pdf", isDirty: true }),
    );

    const indicator = screen.getByLabelText("unsavedChanges");
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveStyle({
      backgroundColor: "var(--mantine-color-yellow-6)",
    });
    expect(screen.queryByLabelText("fileNotSavedToDisk")).toBeNull();
    expect(screen.queryByLabelText("fileSavedToDisk")).toBeNull();
  });

  test("renders green 'saved' indicator when file is persisted and clean", () => {
    renderName(
      buildFileStub({ localFilePath: "/tmp/report.pdf", isDirty: false }),
    );

    const indicator = screen.getByLabelText("fileSavedToDisk");
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveStyle({
      backgroundColor: "var(--mantine-color-green-6)",
    });
    expect(screen.queryByLabelText("fileNotSavedToDisk")).toBeNull();
    expect(screen.queryByLabelText("unsavedChanges")).toBeNull();
  });

  test("renders the filename alongside the indicator", () => {
    renderName(buildFileStub({ name: "invoice.pdf" }));
    expect(screen.getByText("invoice.pdf")).toBeInTheDocument();
  });
});
