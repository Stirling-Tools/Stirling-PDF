import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { expect, it, vi } from "vitest";
import { FileItem } from "@editor/components/shared/FileSidebarFileItem";
import type { FileId } from "@editor/types/file";

vi.mock("@editor/hooks/useLazyThumbnail", () => ({
  useLazyThumbnail: () => undefined,
}));

const fileId = "file-1" as FileId;

function renderItem(props: Partial<Parameters<typeof FileItem>[0]> = {}) {
  render(
    <MantineProvider>
      <FileItem
        fileId={fileId}
        name="Q3 Board Pack.pdf"
        isSelected={false}
        isActive={false}
        isViewedInViewer={false}
        onClick={vi.fn()}
        onEyeClick={vi.fn()}
        {...props}
      />
    </MantineProvider>,
  );
}

function openMenu() {
  fireEvent.click(screen.getByLabelText("fileSidebar.fileItem.moreActions"));
}

it("names the OneDrive file an update will replace and links to it", async () => {
  const onSaveToOneDrive = vi.fn();
  const onOpenInOneDrive = vi.fn();
  renderItem({
    hasOneDriveOrigin: true,
    oneDriveName: "Q3 Board Pack.pdf",
    onSaveToOneDrive,
    onSaveToOneDriveFolder: vi.fn(),
    onOpenInOneDrive,
  });
  openMenu();

  const update = await screen.findByTestId("file-save-onedrive");
  expect(update.textContent).toContain("oneDriveSave.updateOriginal");
  expect(screen.getByTestId("file-save-onedrive-target").textContent).toBe(
    "oneDriveSave.replaces",
  );
  expect(screen.getByTestId("file-save-onedrive-folder").textContent).toContain(
    "oneDriveSave.saveToFolder",
  );

  fireEvent.click(screen.getByTestId("file-open-onedrive"));
  expect(onOpenInOneDrive).toHaveBeenCalledWith(fileId);
  expect(onSaveToOneDrive).not.toHaveBeenCalled();
});

it("marks a file that came from OneDrive", () => {
  renderItem({ hasOneDriveOrigin: true });
  expect(screen.getByTestId("file-onedrive-badge")).toBeTruthy();
});

it("offers only a folder save for a local file", async () => {
  renderItem({
    onSaveToOneDrive: vi.fn(),
    onSaveToOneDriveFolder: vi.fn(),
    onOpenInOneDrive: vi.fn(),
  });
  expect(screen.queryByTestId("file-onedrive-badge")).toBeNull();
  openMenu();

  expect(await screen.findByTestId("file-save-onedrive-folder")).toBeTruthy();
  expect(screen.queryByTestId("file-save-onedrive")).toBeNull();
  expect(screen.queryByTestId("file-open-onedrive")).toBeNull();
});
