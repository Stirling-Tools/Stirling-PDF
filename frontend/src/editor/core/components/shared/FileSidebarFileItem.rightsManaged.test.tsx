import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { FileItem } from "@editor/components/shared/FileSidebarFileItem";
import type { FileId } from "@editor/types/file";

vi.mock("@editor/hooks/useLazyThumbnail", () => ({
  useLazyThumbnail: () => undefined,
}));

const renderRow = (isRightsManaged: boolean) =>
  render(
    <MantineProvider>
      <FileItem
        fileId={"file-1" as FileId}
        name="board-report.pdf"
        isSelected={false}
        isActive={false}
        isViewedInViewer={false}
        isRightsManaged={isRightsManaged}
        onClick={vi.fn()}
        onEyeClick={vi.fn()}
      />
    </MantineProvider>,
  );

describe("FileItem", () => {
  test("marks a Microsoft Purview protected file", () => {
    renderRow(true);
    expect(screen.getByTestId("rights-managed-badge")).toBeInTheDocument();
  });

  test("shows no Purview badge on an ordinary file", () => {
    renderRow(false);
    expect(screen.queryByTestId("rights-managed-badge")).toBeNull();
  });
});
