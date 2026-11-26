import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import FileEditorFileName from "@editor/components/fileEditor/FileEditorFileName";
import type { StirlingFileStub } from "@editor/types/fileContext";
import type { FileId } from "@editor/types/file";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, values?: Record<string, string>) =>
      fallback.replace(
        /{{(\w+)}}/g,
        (_match, name: string) => values?.[name] ?? "",
      ),
  }),
}));

const file: StirlingFileStub = {
  id: "file-1" as FileId,
  name: "report.pdf",
  type: "application/pdf",
  size: 1024,
  lastModified: 0,
  isLeaf: true,
  originalFileId: "file-1",
  versionNumber: 1,
};

function Card({
  onRename,
  onCardClick,
  onCardDoubleClick,
}: {
  onRename: (name: string) => Promise<void>;
  onCardClick: () => void;
  onCardDoubleClick: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div onClick={onCardClick} onDoubleClick={onCardDoubleClick}>
      <FileEditorFileName
        file={file}
        editing={editing}
        onEditingChange={setEditing}
        onRename={onRename}
      />
    </div>
  );
}

function show() {
  const props = {
    onRename: vi.fn().mockResolvedValue(undefined),
    onCardClick: vi.fn(),
    onCardDoubleClick: vi.fn(),
  };
  render(
    <MantineProvider env="test">
      <Card {...props} />
    </MantineProvider>,
  );
  return { ...props, user: userEvent.setup() };
}

describe("FileEditorFileName", () => {
  test("clicking the name edits it without clicking the card", async () => {
    const { user, onCardClick } = show();

    await user.click(screen.getByRole("button", { name: "Rename report.pdf" }));

    expect(screen.getByRole("textbox", { name: "File name" })).toHaveValue(
      "report",
    );
    expect(onCardClick).not.toHaveBeenCalled();
  });

  test("renames on Enter and shows the name again", async () => {
    const { user, onRename } = show();

    await user.click(screen.getByRole("button", { name: "Rename report.pdf" }));
    await user.clear(screen.getByRole("textbox", { name: "File name" }));
    await user.keyboard("summary{Enter}");

    expect(onRename).toHaveBeenCalledExactlyOnceWith("summary.pdf");
    await waitFor(() =>
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument(),
    );
  });

  test("double-clicking the name doesn't open the file", async () => {
    const { user, onCardDoubleClick } = show();

    await user.dblClick(
      screen.getByRole("button", { name: "Rename report.pdf" }),
    );

    expect(onCardDoubleClick).not.toHaveBeenCalled();
    expect(
      screen.getByRole("textbox", { name: "File name" }),
    ).toBeInTheDocument();
  });
});
