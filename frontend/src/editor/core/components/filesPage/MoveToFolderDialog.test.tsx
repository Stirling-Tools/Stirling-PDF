import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { MoveToFolderDialog } from "@app/components/filesPage/MoveToFolderDialog";
import { createFolderId, type FolderRecord } from "@app/types/folder";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

const folder: FolderRecord = {
  id: createFolderId(),
  name: "Documents",
  parentFolderId: null,
  createdAt: 0,
  updatedAt: 0,
};

function show(
  options: {
    onConfirm?: (id: FolderRecord["id"] | null) => Promise<void>;
    onCreateFolder?: (
      name: string,
      parentId: FolderRecord["id"] | null,
    ) => Promise<FolderRecord>;
  } = {},
) {
  const onConfirm = options.onConfirm ?? vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <MantineProvider env="test">
      <MoveToFolderDialog
        opened
        folders={[folder]}
        onClose={onClose}
        {...options}
        onConfirm={onConfirm}
      />
    </MantineProvider>,
  );
  return { onConfirm, onClose };
}

describe("MoveToFolderDialog", () => {
  it("moves files to the selected folder and closes on success", async () => {
    const user = userEvent.setup();
    const { onConfirm, onClose } = show();

    await user.click(screen.getByRole("button", { name: "Documents" }));
    await user.click(screen.getByRole("button", { name: "Move here" }));
    expect(onConfirm).toHaveBeenCalledWith(folder.id);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("allows moving a file to the root", async () => {
    const { onConfirm } = show();
    await userEvent.click(screen.getByRole("button", { name: "Move here" }));
    expect(onConfirm).toHaveBeenCalledWith(null);
  });

  it("selects a newly created folder as the destination", async () => {
    const user = userEvent.setup();
    const created = { ...folder, id: createFolderId(), name: "Invoices" };
    const onCreateFolder = vi.fn().mockResolvedValue(created);
    const { onConfirm } = show({ onCreateFolder });

    await user.click(screen.getByTestId("move-dialog-create-folder-toggle"));
    await user.type(screen.getByLabelText("New folder name"), "Invoices");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Move here" })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "Move here" }));

    expect(onCreateFolder).toHaveBeenCalledWith("Invoices", null);
    expect(onConfirm).toHaveBeenCalledWith(created.id);
  });

  it("keeps the destination picker open when moving fails", async () => {
    const user = userEvent.setup();
    const { onClose } = show({
      onConfirm: vi.fn().mockRejectedValue(new Error("Upload failed")),
    });
    await user.click(screen.getByRole("button", { name: "Documents" }));
    await user.click(screen.getByRole("button", { name: "Move here" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload failed");
    expect(onClose).not.toHaveBeenCalled();
  });
});
