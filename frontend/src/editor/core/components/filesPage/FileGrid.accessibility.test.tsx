import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";
import { FileGrid } from "@app/components/filesPage/FileGrid";
import { FileContextProvider } from "@app/contexts/FileContext";
import { createNewStirlingFileStub } from "@app/types/fileContext";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string, values?: Record<string, string>) => {
      if (key === "filesPage.file") return "Fichier";
      if (key === "filesPage.selectedFile")
        return `${values?.name}, sélectionné`;
      return fallback ?? key;
    },
  }),
}));
vi.mock("@app/hooks/useLazyThumbnail", () => ({
  useLazyThumbnail: () => undefined,
  useDiskThumbnail: () => undefined,
}));

const stored = createNewStirlingFileStub(new File(["text"], "README"));
const disk = {
  path: "/documents/README",
  name: "README",
  sizeBytes: 4,
  lastModified: 0,
};
const props: ComponentProps<typeof FileGrid> = {
  entries: [{ kind: "file", file: stored }],
  selectedFileIds: new Set(),
  viewMode: "grid",
  onSelectFile: () => {},
  onOpenFolder: () => {},
  onOpenFile: () => {},
  onMoveFiles: () => {},
  onMoveFolder: () => {},
  onRenameFolder: () => {},
  onDeleteFolder: () => {},
  onChangeFolderAppearance: () => {},
  onRemoveFiles: () => {},
  onPromptMoveFiles: () => {},
};

function grid(overrides: Partial<ComponentProps<typeof FileGrid>>) {
  return (
    <MantineProvider>
      <FileContextProvider>
        <FileGrid {...props} {...overrides} />
      </FileContextProvider>
    </MantineProvider>
  );
}

describe("file library accessibility", () => {
  it("announces a single selected card without changing its list semantics", () => {
    const view = render(grid({}));
    expect(
      screen.getByRole("listitem", { name: "README" }),
    ).not.toHaveAttribute("aria-selected");

    view.rerender(grid({ selectedFileIds: new Set([stored.id]) }));
    const selected = screen.getByRole("listitem", {
      name: "README, sélectionné",
    });
    expect(selected).not.toHaveAttribute("aria-selected");
    expect(within(selected).queryByRole("checkbox")).not.toBeInTheDocument();

    view.rerender(grid({}));
    expect(screen.getByRole("listitem", { name: "README" })).toBeVisible();
  });

  it("announces native picker selection through its label and checkbox", () => {
    render(
      grid({
        entries: [{ kind: "diskFile", disk }],
        picker: {
          isEligible: () => true,
          selectionDisabled: false,
          disabledReason: () => undefined,
          selectedDiskPaths: new Set([disk.path]),
          onSelectDiskFile: () => {},
          onSetDiskSelection: () => {},
          onUnzipFile: () => {},
        },
      }),
    );
    const card = screen.getByRole("listitem", { name: "README, sélectionné" });
    expect(card).not.toHaveAttribute("aria-selected");
    expect(within(card).getByRole("checkbox")).toBeChecked();
  });

  it.each([
    ["grid", "file"],
    ["grid", "diskFile"],
    ["list", "file"],
    ["list", "diskFile"],
  ] as const)(
    "translates the extensionless fallback in %s for %s entries",
    (viewMode, kind) => {
      render(
        grid({
          viewMode,
          entries: [kind === "file" ? { kind, file: stored } : { kind, disk }],
        }),
      );
      expect(screen.getByText("Fichier")).toBeVisible();
      expect(screen.queryByText("FILE")).not.toBeInTheDocument();
    },
  );
});
