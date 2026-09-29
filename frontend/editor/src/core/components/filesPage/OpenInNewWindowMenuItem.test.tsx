import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider, Menu } from "@mantine/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenInNewWindowMenuItem } from "@app/components/filesPage/OpenInNewWindowMenuItem";
import type { FileId } from "@app/types/file";
import type { StirlingFileStub } from "@app/types/fileContext";

const openInNewWindow = vi.fn();

vi.mock("@app/extensions/openInNewWindow", () => ({
  useOpenInNewWindow: () => ({
    canOpenInNewWindow: () => true,
    openInNewWindow,
  }),
}));

const file = {
  id: "file-1" as FileId,
  name: "document.pdf",
  type: "application/pdf",
  size: 1,
  lastModified: 0,
  isLeaf: true,
  originalFileId: "file-1",
  versionNumber: 1,
} as StirlingFileStub;

function renderItem(disabled: boolean) {
  render(
    <MantineProvider>
      <Menu opened>
        <Menu.Target>
          <button type="button">Actions</button>
        </Menu.Target>
        <Menu.Dropdown>
          <OpenInNewWindowMenuItem file={file} disabled={disabled} />
        </Menu.Dropdown>
      </Menu>
    </MantineProvider>,
  );
}

describe("OpenInNewWindowMenuItem", () => {
  beforeEach(() => openInNewWindow.mockClear());
  afterEach(cleanup);

  it("opens an available file", () => {
    renderItem(false);

    fireEvent.click(screen.getByRole("menuitem", { name: "openInNewWindow" }));

    expect(openInNewWindow).toHaveBeenCalledWith(file);
  });

  it("does not open a processing-locked file", () => {
    renderItem(true);

    const item = screen.getByRole("menuitem", { name: "openInNewWindow" });
    expect(item).toBeDisabled();
    fireEvent.click(item);

    expect(openInNewWindow).not.toHaveBeenCalled();
  });
});
