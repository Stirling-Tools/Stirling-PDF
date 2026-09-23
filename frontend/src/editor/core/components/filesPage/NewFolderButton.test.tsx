import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { NewFolderButton } from "@app/components/filesPage/NewFolderButton";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

function renderButton(props: Partial<Parameters<typeof NewFolderButton>[0]>) {
  const onOpenDialog = vi.fn();
  const onAddLocalFolder = vi.fn();
  render(
    <MantineProvider>
      <NewFolderButton
        label="New folder"
        currentFolderId={null}
        canAddLocalFolder={false}
        onAddLocalFolder={onAddLocalFolder}
        onOpenDialog={onOpenDialog}
        {...props}
      />
    </MantineProvider>,
  );
  return { onOpenDialog, onAddLocalFolder };
}

describe("NewFolderButton", () => {
  it("offers both destinations from the icon trigger where a directory can be mounted", async () => {
    const { onAddLocalFolder } = renderButton({
      trigger: "icon",
      canAddLocalFolder: true,
    });

    await userEvent.click(screen.getByRole("button", { name: "New folder" }));
    await userEvent.click(await screen.findByText("Add local folder"));

    expect(onAddLocalFolder).toHaveBeenCalled();
  });

  it("goes straight to the server where there is nowhere else to put a folder", async () => {
    const { onOpenDialog } = renderButton({ trigger: "icon" });

    await userEvent.click(screen.getByRole("button", { name: "New folder" }));

    expect(onOpenDialog).toHaveBeenCalledWith(null, "server");
  });
});

describe("NewFolderButton in the sidebar", () => {
  it("offers both destinations from the row where a directory can be mounted", async () => {
    const onAddLocalFolder = vi.fn();
    render(
      <MantineProvider>
        <NewFolderButton
          label="New folder"
          trigger="row"
          currentFolderId={null}
          canAddLocalFolder
          onAddLocalFolder={onAddLocalFolder}
          onOpenDialog={vi.fn()}
        />
      </MantineProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "New folder" }));
    await userEvent.click(await screen.findByText("Add local folder"));

    expect(onAddLocalFolder).toHaveBeenCalled();
  });

  it("marks the row disabled with its reason", () => {
    render(
      <MantineProvider>
        <NewFolderButton
          label="New folder"
          trigger="row"
          disabledReason="Sign in to use cloud storage."
          currentFolderId={null}
          canAddLocalFolder
          onAddLocalFolder={vi.fn()}
          onOpenDialog={vi.fn()}
        />
      </MantineProvider>,
    );

    expect(screen.getByRole("button", { name: "New folder" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("NewFolderButton keyboard access", () => {
  it("opens the row's menu from the keyboard", async () => {
    const onAddLocalFolder = vi.fn();
    render(
      <MantineProvider>
        <NewFolderButton
          label="New folder"
          trigger="row"
          currentFolderId={null}
          canAddLocalFolder
          onAddLocalFolder={onAddLocalFolder}
          onOpenDialog={vi.fn()}
        />
      </MantineProvider>,
    );

    screen.getByRole("button", { name: "New folder" }).focus();
    await userEvent.keyboard("{Enter}");

    await userEvent.click(await screen.findByText("Add local folder"));
    expect(onAddLocalFolder).toHaveBeenCalled();
  });
});

describe("NewFolderButton single-destination row", () => {
  it("opens the dialog from the keyboard where the server is the only place", async () => {
    const onOpenDialog = vi.fn();
    render(
      <MantineProvider>
        <NewFolderButton
          label="New folder"
          trigger="row"
          currentFolderId={null}
          canAddLocalFolder={false}
          onAddLocalFolder={vi.fn()}
          onOpenDialog={onOpenDialog}
        />
      </MantineProvider>,
    );

    screen.getByRole("button", { name: "New folder" }).focus();
    await userEvent.keyboard(" ");

    expect(onOpenDialog).toHaveBeenCalledWith(null, "server");
  });
});
