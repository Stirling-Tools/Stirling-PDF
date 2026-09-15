import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";
import {
  ProcessingFolderWizard,
  type ProcessingFolderWizardProps,
} from "@app/components/policies/ProcessingFolderWizard";
import { createFolderId, type FolderRecord } from "@app/types/folder";

import { assemblePolicies } from "@app/policies/overview";
import { POLICY_CATEGORIES } from "@app/policies/catalog";

const folder: FolderRecord = {
  id: createFolderId(),
  name: "Invoices",
  parentFolderId: null,
  kind: "server",
  createdAt: 0,
  updatedAt: 0,
};
const key = (name: string) => `processingFolders.setup.${name}`;

function renderWizard(overrides: Partial<ProcessingFolderWizardProps> = {}) {
  const props: ProcessingFolderWizardProps = {
    folders: [folder],
    catalogue: assemblePolicies([], []).catalogue,
    aiEngineEnabled: true,
    canPickDirectory: false,
    serverDisabledReason: null,
    serverLabel: "Server storage",
    pickDirectory: vi.fn().mockResolvedValue(null),
    recordFor: () => undefined,
    resolveTarget: vi.fn().mockResolvedValue(folder),
    save: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };
  render(
    <MantineProvider>
      <ProcessingFolderWizard {...props} />
    </MantineProvider>,
  );
  return props;
}

function button(name: string) {
  return screen.getByRole("button", { name: key(name) });
}

function createServerFolder() {
  fireEvent.click(button("newFolder"));
  fireEvent.change(screen.getByLabelText(new RegExp(key("folderName"))), {
    target: { value: "Invoices" },
  });
  fireEvent.click(button("chooseProcessing"));
}

describe("ProcessingFolderWizard", () => {
  it("selects nested folders from the library list and retains selection when returning", async () => {
    const child: FolderRecord = {
      ...folder,
      id: createFolderId(),
      parentFolderId: folder.id,
      name: "2026",
    };
    const virtual: FolderRecord = {
      ...folder,
      id: createFolderId(),
      kind: "virtual",
      name: "Browser folder",
    };
    const props = renderWizard({
      folders: [folder, child, virtual],
      resolveTarget: vi.fn().mockResolvedValue(child),
    });
    const grid = screen.getByRole("grid", { name: key("selectFolder") });
    expect(within(grid).queryByRole("radio", { name: "2026" })).toBeNull();
    expect(screen.queryByRole("radio", { name: virtual.name })).toBeNull();
    const row = within(grid)
      .getByRole("radio", { name: folder.name })
      .closest('[role="row"]')!;
    fireEvent.contextMenu(row);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(row).not.toHaveAttribute("draggable");
    expect(screen.queryByRole("button", { name: "Folder actions" })).toBeNull();
    fireEvent.doubleClick(row);
    const childRow = screen
      .getByRole("radio", { name: "2026" })
      .closest('[role="row"]')!;
    fireEvent.keyDown(childRow, { key: " " });
    expect(childRow).toHaveAttribute("aria-selected", "true");
    fireEvent.click(button("chooseProcessing"));
    fireEvent.click(button("change"));
    expect(screen.getByRole("radio", { name: "2026" })).toBeChecked();
    fireEvent.click(button("chooseProcessing"));
    fireEvent.click(button("review"));
    fireEvent.click(button("enable"));
    await waitFor(() =>
      expect(props.resolveTarget).toHaveBeenCalledWith({
        kind: "existing",
        folder: child,
      }),
    );
  });

  it("searches nested folders and creates inside the chosen parent only on confirmation", async () => {
    const child: FolderRecord = {
      ...folder,
      id: createFolderId(),
      parentFolderId: folder.id,
      name: "2026",
    };
    const props = renderWizard({ folders: [folder, child] });
    fireEvent.change(
      screen.getByRole("textbox", { name: key("searchFolders") }),
      { target: { value: "2026" } },
    );
    fireEvent.click(screen.getByRole("radio", { name: "2026" }));
    fireEvent.click(button("newFolder"));
    fireEvent.change(screen.getByLabelText(new RegExp(key("folderName"))), {
      target: { value: "Receipts" },
    });
    expect(props.resolveTarget).not.toHaveBeenCalled();
    fireEvent.click(button("chooseProcessing"));
    fireEvent.click(button("review"));
    fireEvent.click(button("enable"));
    await waitFor(() =>
      expect(props.resolveTarget).toHaveBeenCalledWith({
        kind: "server",
        name: "Receipts",
        parentId: child.id,
      }),
    );
  });

  it("limits rows to the chosen storage and blocks unavailable server selection", () => {
    const local: FolderRecord = {
      ...folder,
      id: createFolderId(),
      kind: "local",
      name: "Documents",
      directory: "C:/Documents",
    };
    renderWizard({
      folders: [folder, local],
      canPickDirectory: true,
      serverDisabledReason: "Sign in first",
    });
    expect(screen.queryByRole("radio", { name: folder.name })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: local.name }));
    expect(button("chooseProcessing")).toBeEnabled();
    fireEvent.click(screen.getByRole("radio", { name: "Server storage" }));
    expect(screen.queryByRole("radio", { name: local.name })).toBeNull();
    expect(screen.getByRole("radio", { name: folder.name })).toBeDisabled();
    expect(button("newFolder")).toBeDisabled();
    fireEvent.click(
      screen.getByRole("radio", { name: folder.name }).closest('[role="row"]')!,
    );
    expect(button("chooseProcessing")).toBeDisabled();
  });

  it("defers folder creation until review and retains processing choices when going back", async () => {
    const props = renderWizard();
    createServerFolder();
    fireEvent.click(
      screen.getByRole("button", {
        name: "portal.policies.categories.classification.label",
      }),
    );
    expect(props.resolveTarget).not.toHaveBeenCalled();
    fireEvent.click(button("review"));
    expect(
      screen.getByText("portal.policies.endpoints.classifyAndLabel"),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "filesPage.processingSetup.back" }),
    );
    fireEvent.click(button("change"));
    expect(screen.getByLabelText(new RegExp(key("folderName")))).toHaveValue(
      "Invoices",
    );
    fireEvent.click(button("chooseProcessing"));
    expect(
      screen.getByRole("button", {
        name: "portal.policies.categories.classification.label",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button("review"));
    fireEvent.click(button("enable"));
    await waitFor(() =>
      expect(props.save).toHaveBeenCalledWith(
        folder,
        expect.objectContaining({
          steps: [
            expect.objectContaining({
              operation: "/api/v1/ai/tools/classify-and-label",
            }),
          ],
        }),
      ),
    );
    expect(props.resolveTarget).toHaveBeenCalledWith({
      kind: "server",
      name: "Invoices",
      parentId: null,
    });
  }, 20_000);

  it("reuses the newly created folder when processing fails and is retried", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("Server unavailable"))
      .mockResolvedValueOnce(undefined);
    const props = renderWizard({ save });
    createServerFolder();
    fireEvent.click(button("review"));
    fireEvent.click(button("enable"));
    await screen.findByText("Server unavailable");
    fireEvent.click(button("change"));
    expect(screen.getByRole("radio", { name: folder.name })).toBeChecked();
    expect(screen.queryByLabelText(new RegExp(key("folderName")))).toBeNull();
    fireEvent.click(button("chooseProcessing"));
    fireEvent.click(button("review"));
    fireEvent.click(button("enable"));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(props.resolveTarget).toHaveBeenLastCalledWith({
      kind: "existing",
      folder,
    });
  });

  it("skips folder selection when editing paused processing", async () => {
    const props = renderWizard({
      initialFolder: folder,
      recordFor: () => ({
        id: "processing-1",
        enabled: false,
        steps: [
          {
            operation: "/api/v1/misc/compress-pdf",
            parameters: { optimizeLevel: "3" },
          },
        ],
      }),
    });
    expect(
      screen.queryByRole("button", { name: key("chooseProcessing") }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: key("change") })).toBeNull();
    fireEvent.click(button("review"));
    fireEvent.click(button("saveChanges"));
    await waitFor(() => expect(props.save).toHaveBeenCalledTimes(1));
  });

  it("offers native folder selection when available and treats cancellation as no selection", async () => {
    const pickDirectory = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ path: "C:/Invoices", name: "Invoices" });
    renderWizard({
      canPickDirectory: true,
      serverDisabledReason: "Sign in first",
      pickDirectory,
    });
    fireEvent.click(button("browseComputer"));
    await waitFor(() => expect(pickDirectory).toHaveBeenCalledTimes(1));
    expect(button("chooseProcessing")).toBeDisabled();
    fireEvent.click(button("browseComputer"));
    await screen.findByText("C:/Invoices");
    expect(button("chooseProcessing")).toBeEnabled();
  });

  it("does not offer native folders in browser builds and explains unavailable storage", () => {
    renderWizard({ serverDisabledReason: "Sign in first" });
    expect(screen.queryByRole("radio", { name: key("computer") })).toBeNull();
    expect(screen.getByText("Sign in first")).toBeVisible();
    expect(button("chooseProcessing")).toBeDisabled();
  });

  it("blocks saving when saved processing could not be loaded", () => {
    renderWizard({
      initialFolder: folder,
      loadError: "Could not load processing",
      onRetry: vi.fn(),
    });
    expect(screen.getByText("Could not load processing")).toBeVisible();
    expect(button("review")).toBeDisabled();
  });

  it("shows every portal preset with its canonical name and a separate info button", () => {
    renderWizard({ initialFolder: folder });
    const chooser = screen.getByRole("group", { name: key("presetsLabel") });
    for (const category of POLICY_CATEGORIES) {
      expect(
        within(chooser).getByRole("button", { name: category.label }),
      ).toBeVisible();
    }
    expect(
      within(chooser).getAllByRole("button", { name: key("presetInfo") }),
    ).toHaveLength(POLICY_CATEGORIES.length);
    expect(
      within(chooser).getByRole("button", {
        name: "portal.policies.categories.ingestion.label",
      }),
    ).toBeDisabled();
    expect(
      within(chooser).getByRole("button", {
        name: "portal.policies.categories.retention.label",
      }),
    ).toBeDisabled();
  });

  it("prioritises configured policies and saves their actual processing settings", async () => {
    const catalogue = assemblePolicies(
      [
        {
          id: "saved-compliance",
          name: "Compliance",
          enabled: true,
          inputs: [],
          output: { type: "inline", options: { categoryId: "compliance" } },
          steps: [
            {
              operation: "/api/v1/security/sanitize-pdf",
              parameters: {
                removeJavaScript: false,
                removeMetadata: true,
                customServerOption: "keep",
              },
            },
          ],
        },
      ],
      [],
    ).catalogue;
    const props = renderWizard({ initialFolder: folder, catalogue });
    const chooser = screen.getByRole("group", { name: key("presetsLabel") });
    const first = within(chooser).getAllByRole("button")[0];
    expect(first).toHaveAccessibleName(
      "portal.policies.categories.compliance.label",
    );
    expect(first).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button("review"));
    expect(screen.queryByText("When it runs")).toBeNull();
    expect(screen.queryByText("Files and originals")).toBeNull();
    fireEvent.click(button("enable"));
    await waitFor(() =>
      expect(props.save).toHaveBeenCalledWith(
        folder,
        expect.objectContaining({
          steps: [
            expect.objectContaining({
              operation: "/api/v1/security/sanitize-pdf",
              parameters: expect.objectContaining({
                removeJavaScript: false,
                removeMetadata: true,
                customServerOption: "keep",
              }),
            }),
          ],
        }),
      ),
    );
  });

  it("uses the portal availability flags for presets", () => {
    const catalogue = assemblePolicies([], []).catalogue.map((entry) => ({
      ...entry,
      category: {
        ...entry.category,
        requiresAiEngine: entry.category.id === "classification",
      },
    }));
    renderWizard({ initialFolder: folder, aiEngineEnabled: false, catalogue });
    expect(
      screen.getByRole("button", {
        name: "portal.policies.categories.classification.label",
      }),
    ).toBeDisabled();
    expect(button("review")).toBeEnabled();
  });

  it("keeps the dialog and preset focus when switching between saved and default presets", async () => {
    const catalogue = assemblePolicies(
      [
        {
          id: "saved-compliance",
          name: "Compliance",
          enabled: true,
          inputs: [],
          output: { type: "inline", options: { categoryId: "compliance" } },
          steps: [
            {
              operation: "/api/v1/security/sanitize-pdf",
              parameters: { removeMetadata: true },
            },
          ],
        },
      ],
      [],
    ).catalogue;
    const props = renderWizard({ initialFolder: folder, catalogue });
    const dialog = screen.getByRole("dialog");
    for (const category of ["security", "classification", "compliance"]) {
      const preset = screen.getByRole("button", {
        name: `portal.policies.categories.${category}.label`,
      });
      preset.focus();
      fireEvent.click(preset);
      expect(screen.getByRole("dialog")).toBe(dialog);
      expect(preset).toHaveFocus();
      expect(preset).toHaveAttribute("aria-pressed", "true");
    }
    fireEvent.click(button("review"));
    fireEvent.click(button("enable"));
    await waitFor(() =>
      expect(props.save).toHaveBeenCalledWith(
        folder,
        expect.objectContaining({
          steps: [
            expect.objectContaining({
              operation: "/api/v1/security/sanitize-pdf",
              parameters: expect.objectContaining({ removeMetadata: true }),
            }),
          ],
        }),
      ),
    );
  });
});
