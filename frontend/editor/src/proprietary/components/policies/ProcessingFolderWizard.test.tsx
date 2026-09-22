import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProcessingFolderWizard,
  type ProcessingFolderWizardProps,
} from "@app/components/policies/ProcessingFolderWizard";
import { createFolderId, type FolderRecord } from "@app/types/folder";

import { assemblePolicies } from "@app/policies/overview";
import { PolicySetupWizard } from "@app/components/policies/PolicySetupWizard";
import {
  classificationCondition,
  documentFieldCondition,
} from "@app/data/classificationConditions";
import { POLICY_CATEGORIES } from "@app/policies/catalog";
import { directoryFromDrop } from "@app/services/directoryDrop";

const classification = vi.hoisted(() => ({ available: true }));
vi.mock("@app/hooks/useAiClassificationEnabled", () => ({
  useAiClassificationEnabled: () => classification.available,
}));
// The output panel is covered by its own tests; here it stands in for the wiring and the gate.
const setupConfigValid = vi.hoisted(() => ({ value: true }));
vi.mock("@app/components/policies/FolderPolicySetupConfig", async () => {
  const { useEffect } = await vi.importActual<typeof import("react")>("react");
  return {
    FolderPolicySetupConfig: ({
      folderName,
      onValidityChange,
    }: {
      folderName: string;
      onValidityChange: (valid: boolean) => void;
    }) => {
      useEffect(
        () => onValidityChange(setupConfigValid.value),
        [onValidityChange],
      );
      return <p>{`output panel for ${folderName}`}</p>;
    },
  };
});

beforeEach(() => {
  classification.available = true;
  setupConfigValid.value = true;
});

vi.mock("@app/services/directoryDrop", () => ({
  canDropDirectory: true,
  directoryFromDrop: vi.fn(),
}));

vi.mock("@app/components/policies/useFolderPickerBack", () => ({
  useFolderPickerBack: (_enabled: boolean, onBack: () => boolean) => onBack,
}));

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

function addFolderButton() {
  return within(
    document.querySelector(".folder-setup__folder-toolbar") as HTMLElement,
  ).getByRole("button", { name: key("addFolder") });
}

function addServerDraft() {
  fireEvent.click(
    within(screen.getByRole("form", { name: key("newFolder") })).getByRole(
      "button",
      { name: key("addFolder") },
    ),
  );
}

function createServerFolder() {
  fireEvent.click(addFolderButton());
  fireEvent.change(screen.getByLabelText(new RegExp(key("folderName"))), {
    target: { value: "Receipts" },
  });
  addServerDraft();
}

async function returnToFoldersAfterAdding() {
  fireEvent.click(await screen.findByRole("button", { name: key("change") }));
}

describe("ProcessingFolderWizard", () => {
  it("selects a dropped folder and goes straight to processing without saving", async () => {
    const directory = { path: "C:/Dropped", name: "Dropped" };
    vi.mocked(directoryFromDrop).mockResolvedValueOnce(directory);
    const props = renderWizard({ canPickDirectory: true });
    const dropzone = document.querySelector(".folder-setup__dropzone")!;
    const dataTransfer = { types: ["Files"], dropEffect: "none" };
    fireEvent.dragEnter(dropzone, { dataTransfer });
    expect(dropzone).toHaveAttribute("data-dragging", "true");
    fireEvent.drop(dropzone, { dataTransfer });
    expect(
      await screen.findByRole("button", { name: key("enable") }),
    ).toBeVisible();
    expect(screen.getByTitle("Dropped")).toBeVisible();
    expect(props.resolveTarget).not.toHaveBeenCalled();
    expect(props.save).not.toHaveBeenCalled();
    fireEvent.click(button("enable"));
    await waitFor(() =>
      expect(props.resolveTarget).toHaveBeenCalledWith({
        kind: "local",
        directory,
        name: null,
      }),
    );
  });

  it("keeps invalid drops on the folder step and clears drag feedback", async () => {
    vi.mocked(directoryFromDrop).mockResolvedValueOnce(null);
    renderWizard({ canPickDirectory: true });
    const dropzone = document.querySelector(".folder-setup__dropzone")!;
    const dataTransfer = { types: ["Files"], dropEffect: "none" };
    fireEvent.dragEnter(dropzone, { dataTransfer });
    fireEvent.drop(dropzone, { dataTransfer });
    expect(await screen.findByText(key("dropError"))).toBeVisible();
    expect(dropzone).not.toHaveAttribute("data-dragging");
    expect(button("chooseProcessing")).toBeDisabled();
  });

  it("offers computer folders and the Downloads demo without showing modified dates", async () => {
    const onProcessDownloads = vi.fn();
    const props = renderWizard({
      canPickDirectory: true,
      serverDisabledReason: "Server unavailable",
      downloadsProcessing: { count: 50, start: onProcessDownloads },
      pickDirectory: vi
        .fn()
        .mockResolvedValue({ path: "C:/Documents", name: "Documents" }),
    });
    expect(
      screen.queryByRole("columnheader", { name: "filesPage.column.modified" }),
    ).toBeNull();
    fireEvent.click(button("dropHeading"));
    await returnToFoldersAfterAdding();
    expect(
      await screen.findByRole("radio", { name: "Documents" }),
    ).toBeChecked();
    fireEvent.click(button("downloadsAction"));
    expect(onProcessDownloads).toHaveBeenCalledOnce();
    expect(props.resolveTarget).not.toHaveBeenCalled();
    expect(props.save).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "marks existing processing (enabled: %s) and warns before saving directly from processing",
    async (enabled) => {
      const record = {
        id: "existing-processing",
        enabled,
        steps: [{ operation: "/api/v1/misc/compress-pdf", parameters: {} }],
      };
      const props = renderWizard({ recordFor: () => record });
      const row = screen
        .getByRole("radio", { name: folder.name })
        .closest('[role="row"]')!;
      expect(
        within(row as HTMLElement).getByText(
          enabled
            ? "filesPage.processing.active"
            : "filesPage.processing.paused",
        ),
      ).toBeVisible();
      expect(screen.queryByText(key("replaceWarning"))).toBeNull();
      fireEvent.click(screen.getByRole("radio", { name: folder.name }));
      expect(screen.getByText(key("replaceWarning"))).toBeVisible();
      fireEvent.click(button("chooseProcessing"));
      expect(screen.getByText(key("replaceWarning"))).toBeVisible();
      expect(props.save).not.toHaveBeenCalled();
      fireEvent.click(button("saveChanges"));
      await waitFor(() =>
        expect(props.save).toHaveBeenCalledWith(
          folder,
          expect.objectContaining({
            steps: expect.arrayContaining([
              expect.objectContaining({
                operation: "/api/v1/misc/compress-pdf",
              }),
            ]),
          }),
        ),
      );
    },
  );

  it("clears the replacement warning for a new child or an ordinary folder", () => {
    const ordinary = { ...folder, id: createFolderId(), name: "Receipts" };
    const record = {
      id: "existing-processing",
      enabled: true,
      steps: [{ operation: "/api/v1/misc/compress-pdf", parameters: {} }],
    };
    renderWizard({
      folders: [folder, ordinary],
      recordFor: (item) => (item.id === folder.id ? record : undefined),
    });
    fireEvent.click(screen.getByRole("radio", { name: folder.name }));
    expect(screen.getByText(key("replaceWarning"))).toBeVisible();
    fireEvent.click(addFolderButton());
    expect(screen.queryByText(key("replaceWarning"))).toBeNull();
    fireEvent.click(
      within(screen.getByRole("form", { name: key("newFolder") })).getByRole(
        "button",
        { name: "cancel" },
      ),
    );
    expect(screen.getByText(key("replaceWarning"))).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: ordinary.name }));
    expect(screen.queryByText(key("replaceWarning"))).toBeNull();
    expect(screen.getAllByText("filesPage.processing.active")).toHaveLength(1);
  });

  it.each(["C:/Invoices/", "c:\\INVOICES\\"])(
    "recognises existing local processing when the native picker returns %s",
    async (path) => {
      const local: FolderRecord = {
        ...folder,
        kind: "local",
        directory: "C:/Invoices",
      };
      const record = {
        id: "local-processing",
        enabled: false,
        steps: [{ operation: "/api/v1/misc/compress-pdf", parameters: {} }],
      };
      renderWizard({
        folders: [local],
        canPickDirectory: true,
        recordFor: (item) => (item.id === local.id ? record : undefined),
        pickDirectory: vi.fn().mockResolvedValue({ path, name: "Invoices" }),
      });
      fireEvent.click(addFolderButton());
      fireEvent.click(
        await screen.findByRole("menuitem", {
          name: key("fromComputer"),
        }),
      );
      expect(await screen.findByText(key("replaceWarning"))).toBeVisible();
      await returnToFoldersAfterAdding();
      expect(screen.getByRole("radio", { name: local.name })).toBeChecked();
      expect(screen.getByText("filesPage.processing.paused")).toBeVisible();
      fireEvent.click(button("chooseProcessing"));
      expect(screen.getByText(key("replaceWarning"))).toBeVisible();
      expect(button("saveChanges")).toBeEnabled();
    },
  );

  it.each(["security", "classification", "compliance"])(
    "submits the same default steps as the Processor %s template",
    async (categoryId) => {
      const catalogue = assemblePolicies([], []).catalogue;
      const entry = catalogue.find(
        (preset) => preset.category.id === categoryId,
      )!;
      const capture = vi.fn();
      const template = render(
        <MantineProvider>
          <PolicySetupWizard
            entry={entry}
            onClose={() => {}}
            onSubmit={vi.fn()}
          >
            {({ content, steps }) => (
              <>
                {content}
                <button onClick={() => capture(steps)}>Capture template</button>
              </>
            )}
          </PolicySetupWizard>
        </MantineProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Capture template" }));
      const expectedSteps = capture.mock.calls[0][0];
      template.unmount();
      const props = renderWizard({ initialFolder: folder, catalogue });
      fireEvent.click(
        screen.getByRole("button", { name: entry.category.label }),
      );
      fireEvent.click(button("enable"));
      await waitFor(() =>
        expect(props.save).toHaveBeenCalledWith(
          folder,
          expect.objectContaining({ steps: expectedSteps }),
        ),
      );
    },
  );

  it.each([
    {
      ai: true,
      condition: classificationCondition(["invoice"]),
      canSave: true,
    },
    {
      ai: false,
      condition: classificationCondition(["invoice"]),
      canSave: false,
    },
    {
      ai: false,
      condition: documentFieldCondition("document.extension", ["pdf"]),
      canSave: true,
    },
  ])(
    "keeps saved routing with AI=$ai and condition=$condition.input.field",
    async ({ ai, condition, canSave }) => {
      classification.available = ai;
      const routingRules = [{ condition, outputId: "finance" }];
      const catalogue = assemblePolicies(
        [
          {
            id: "saved-routing",
            name: "Routing",
            enabled: true,
            inputs: [],
            output: { type: "inline", options: { categoryId: "routing" } },
            steps: [
              {
                operation: "/api/v1/ai/tools/classify-and-label",
                parameters: {},
              },
            ],
            outputIds: ["archive"],
            routingRules,
          },
        ],
        [],
      ).catalogue;
      const props = renderWizard({
        initialFolder: folder,
        catalogue,
        destinations: [
          { id: "finance", name: "Finance" },
          { id: "archive", name: "Archive" },
        ],
      });
      expect(
        screen.getByRole("button", {
          name: "portal.policies.categories.routing.label",
        }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(screen.queryByText("Watch")).toBeNull();
      if (!canSave) {
        expect(button("enable")).toBeDisabled();
        expect(props.save).not.toHaveBeenCalled();
        return;
      }
      expect(button("enable")).toBeEnabled();
      fireEvent.click(button("enable"));
      await waitFor(() =>
        expect(props.save).toHaveBeenCalledWith(
          folder,
          expect.objectContaining({
            outputIds: ["archive"],
            routingRules,
            steps: ai
              ? [
                  expect.objectContaining({
                    operation: "/api/v1/ai/tools/classify-and-label",
                  }),
                ]
              : [],
          }),
        ),
      );
    },
  );

  it("offers Routing but requires routes and a fallback before enabling processing", () => {
    renderWizard({
      initialFolder: folder,
      destinations: [{ id: "archive", name: "Archive" }],
    });
    const routing = screen.getByRole("button", {
      name: "portal.policies.categories.routing.label",
    });
    expect(routing).toBeEnabled();
    fireEvent.click(routing);
    expect(button("enable")).toBeDisabled();
    expect(
      screen.getByRole("textbox", {
        name: "portal.pipelines.builder.routing.fallback",
      }),
    ).toBeVisible();
  });

  it("goes back through visited folders and search without repeating the folder path below the list", () => {
    const child: FolderRecord = {
      ...folder,
      id: createFolderId(),
      parentFolderId: folder.id,
      name: "2026",
    };
    renderWizard({ folders: [folder, child] });
    const back = screen.getByRole("button", { name: "filesPage.back" });
    expect(back).toBeDisabled();
    const search = screen.getByRole("textbox", { name: key("searchFolders") });
    fireEvent.change(search, { target: { value: "2026" } });
    fireEvent.doubleClick(
      screen.getByRole("radio", { name: "2026" }).closest('[role="row"]')!,
    );
    expect(back).toBeEnabled();
    expect(
      document.querySelector(".folder-setup__picker > .folder-setup__path"),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: folder.name }));
    expect(screen.getByRole("radio", { name: "2026" })).toBeVisible();
    fireEvent.click(back);
    expect(screen.queryByRole("radio", { name: "2026" })).toBeNull();
    fireEvent.click(back);
    expect(search).toHaveValue("2026");
    expect(screen.getByRole("radio", { name: "2026" })).toBeVisible();
    expect(back).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "filesPage.tree" }));
    expect(search).toHaveValue("");
    expect(screen.getByRole("radio", { name: folder.name })).toBeVisible();
    fireEvent.click(back);
    expect(search).toHaveValue("2026");
  });

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
    fireEvent.click(button("enable"));
    await waitFor(() =>
      expect(props.resolveTarget).toHaveBeenCalledWith({
        kind: "existing",
        folder: child,
      }),
    );
  });

  it("shows both storage locations and searches across them from inside a folder", async () => {
    const local: FolderRecord = {
      ...folder,
      id: createFolderId(),
      name: "Documents",
      kind: "local",
      directory: "C:/Documents",
    };
    const localChild: FolderRecord = {
      ...local,
      id: createFolderId(),
      name: "2026 local",
      parentFolderId: local.id,
      directory: "C:/Documents/2026",
    };
    const serverChild: FolderRecord = {
      ...folder,
      id: createFolderId(),
      name: "2026 server",
      parentFolderId: folder.id,
    };
    const props = renderWizard({
      folders: [folder, serverChild, local, localChild],
      canPickDirectory: true,
      resolveTarget: vi.fn().mockResolvedValue(localChild),
    });
    const serverRow = screen
      .getByRole("radio", { name: folder.name })
      .closest('[role="row"]')!;
    const localRow = screen
      .getByRole("radio", { name: local.name })
      .closest('[role="row"]')!;
    expect(
      within(serverRow as HTMLElement).getByText("Server storage"),
    ).toBeVisible();
    expect(
      within(localRow as HTMLElement).getByText(key("computer")),
    ).toBeVisible();
    fireEvent.doubleClick(serverRow);
    fireEvent.change(
      screen.getByRole("textbox", { name: key("searchFolders") }),
      {
        target: { value: "2026" },
      },
    );
    expect(screen.getByRole("radio", { name: serverChild.name })).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: localChild.name }));
    fireEvent.click(button("chooseProcessing"));
    fireEvent.click(button("change"));
    expect(screen.getByRole("radio", { name: localChild.name })).toBeChecked();
    fireEvent.click(button("chooseProcessing"));
    fireEvent.click(button("enable"));
    await waitFor(() =>
      expect(props.resolveTarget).toHaveBeenCalledWith({
        kind: "existing",
        folder: localChild,
      }),
    );
  });

  it("keeps existing folders selectable while the new-folder form is open", async () => {
    const local: FolderRecord = {
      ...folder,
      id: createFolderId(),
      name: "Documents",
      kind: "local",
      directory: "C:/Documents",
    };
    const props = renderWizard({ folders: [folder, local] });
    fireEvent.click(addFolderButton());
    fireEvent.change(screen.getByLabelText(new RegExp(key("folderName"))), {
      target: { value: "Receipts" },
    });
    expect(screen.getByRole("radio", { name: local.name })).toBeEnabled();
    expect(screen.getByRole("radio", { name: folder.name })).toBeEnabled();
    fireEvent.click(screen.getByRole("radio", { name: local.name }));
    expect(screen.queryByRole("form", { name: key("newFolder") })).toBeNull();
    expect(screen.getByRole("radio", { name: local.name })).toBeChecked();
    fireEvent.click(button("chooseProcessing"));
    fireEvent.click(button("enable"));
    await waitFor(() =>
      expect(props.resolveTarget).toHaveBeenCalledWith({
        kind: "existing",
        folder: local,
      }),
    );
  });

  it("restricts only the location picker and selects a new server folder after adding it", async () => {
    const local: FolderRecord = {
      ...folder,
      id: createFolderId(),
      name: "Documents",
      kind: "local",
      directory: "C:/Documents",
    };
    const props = renderWizard({ folders: [folder, local] });
    fireEvent.click(addFolderButton());
    fireEvent.change(screen.getByLabelText(new RegExp(key("folderName"))), {
      target: { value: "Receipts" },
    });
    fireEvent.click(button("changeLocation"));
    const locations = await screen.findByRole("dialog", {
      name: key("changeLocation"),
      hidden: true,
    });
    // JSDOM has no layout, so Floating UI hides the picker after positioning.
    expect(
      within(locations).getByRole("button", {
        name: local.directory,
        hidden: true,
      }),
    ).toBeDisabled();
    expect(screen.getByRole("radio", { name: local.name })).toBeEnabled();
    fireEvent.click(
      within(locations).getByRole("button", {
        name: folder.name,
        hidden: true,
      }),
    );
    expect(
      within(screen.getByRole("form", { name: key("newFolder") })).getByText(
        `Server storage / ${folder.name}`,
      ),
    ).toBeVisible();
    expect(screen.getByRole("radio", { name: folder.name })).not.toBeChecked();
    expect(button("chooseProcessing")).toBeDisabled();
    addServerDraft();
    await returnToFoldersAfterAdding();
    expect(screen.getByRole("radio", { name: "Receipts" })).toBeChecked();
    expect(screen.queryByRole("form", { name: key("newFolder") })).toBeNull();
    expect(props.resolveTarget).not.toHaveBeenCalled();
    fireEvent.click(button("chooseProcessing"));
    fireEvent.click(button("enable"));
    await waitFor(() =>
      expect(props.resolveTarget).toHaveBeenCalledWith({
        kind: "server",
        name: "Receipts",
        parentId: folder.id,
      }),
    );
  });

  it("returns to root when switching from a desktop directory to server creation", async () => {
    const local: FolderRecord = {
      ...folder,
      id: createFolderId(),
      name: "Documents",
      kind: "local",
      directory: "C:/Documents",
    };
    renderWizard({ folders: [folder, local], canPickDirectory: true });
    fireEvent.doubleClick(
      screen.getByRole("radio", { name: local.name }).closest('[role="row"]')!,
    );
    expect(screen.getByRole("button", { name: local.name })).toHaveAttribute(
      "aria-current",
      "location",
    );
    fireEvent.click(addFolderButton());
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: /filesPage.newFolderMenu.server/,
      }),
    );
    expect(
      screen.getByRole("button", { name: "filesPage.tree" }),
    ).toHaveAttribute("aria-current", "location");
    expect(screen.queryByRole("button", { name: local.name })).toBeNull();
    expect(screen.getByRole("radio", { name: local.name })).toBeEnabled();
    expect(screen.getByRole("radio", { name: folder.name })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "filesPage.back" }),
    ).toBeDisabled();
    expect(
      within(screen.getByRole("form", { name: key("newFolder") })).getByText(
        "Server storage",
      ),
    ).toBeVisible();
  });

  it("keeps a valid server parent, preserves cancellation, and adds native folders at root", async () => {
    const picked = { path: "C:/Documents", name: "Documents" };
    const pickDirectory = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(picked);
    const props = renderWizard({ canPickDirectory: true, pickDirectory });
    fireEvent.doubleClick(
      screen.getByRole("radio", { name: folder.name }).closest('[role="row"]')!,
    );
    fireEvent.click(addFolderButton());
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: /filesPage.newFolderMenu.server/,
      }),
    );
    const name = screen.getByRole("textbox", {
      name: new RegExp(key("folderName")),
    });
    fireEvent.change(name, { target: { value: "Receipts" } });
    expect(screen.getByRole("button", { name: folder.name })).toHaveAttribute(
      "aria-current",
      "location",
    );
    expect(
      within(screen.getByRole("form", { name: key("newFolder") })).getByText(
        `Server storage / ${folder.name}`,
      ),
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByRole("menu", { hidden: true })).toBeNull(),
    );
    fireEvent.click(addFolderButton());
    // JSDOM has no layout, so Floating UI hides the menu after positioning.
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: key("fromComputer"),
        hidden: true,
      }),
    );
    await waitFor(() => expect(pickDirectory).toHaveBeenCalledTimes(1));
    expect(name).toHaveValue("Receipts");
    expect(screen.getByRole("button", { name: folder.name })).toHaveAttribute(
      "aria-current",
      "location",
    );
    await waitFor(() => expect(addFolderButton()).toBeEnabled());
    fireEvent.click(addFolderButton());
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: key("fromComputer"),
        hidden: true,
      }),
    );
    await returnToFoldersAfterAdding();
    expect(screen.getByRole("radio", { name: picked.name })).toBeChecked();
    expect(
      screen.getByRole("button", { name: "filesPage.tree" }),
    ).toHaveAttribute("aria-current", "location");
    expect(
      screen.getByRole("button", { name: "filesPage.back" }),
    ).toBeDisabled();
    expect(screen.queryByRole("form", { name: key("newFolder") })).toBeNull();
    fireEvent.click(button("chooseProcessing"));
    fireEvent.click(button("enable"));
    await waitFor(() =>
      expect(props.resolveTarget).toHaveBeenCalledWith({
        kind: "local",
        directory: picked,
        name: null,
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
    fireEvent.click(addFolderButton());
    fireEvent.change(screen.getByLabelText(new RegExp(key("folderName"))), {
      target: { value: "Receipts" },
    });
    fireEvent.click(button("changeLocation"));
    fireEvent.click(
      within(
        await screen.findByRole("dialog", {
          name: key("changeLocation"),
          hidden: true,
        }),
      ).getByRole("button", { name: `${folder.name} / 2026`, hidden: true }),
    );
    addServerDraft();
    expect(props.resolveTarget).not.toHaveBeenCalled();
    fireEvent.click(button("enable"));
    await waitFor(() =>
      expect(props.resolveTarget).toHaveBeenCalledWith({
        kind: "server",
        name: "Receipts",
        parentId: child.id,
      }),
    );
  });

  it("keeps local folders and search usable while server rows and creation are unavailable", async () => {
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
    expect(screen.getByRole("radio", { name: folder.name })).toBeDisabled();
    expect(screen.getByRole("radio", { name: local.name })).toBeEnabled();
    expect(
      screen.getByRole("textbox", { name: key("searchFolders") }),
    ).toBeEnabled();
    fireEvent.click(
      screen.getByRole("radio", { name: folder.name }).closest('[role="row"]')!,
    );
    expect(button("chooseProcessing")).toBeDisabled();
    expect(addFolderButton()).toBeEnabled();
    fireEvent.click(addFolderButton());
    // JSDOM has no layout, so Floating UI hides the menu after positioning.
    const menu = await screen.findByRole("menu", { hidden: true });
    expect(
      within(menu).getByRole("menuitem", {
        name: /filesPage.newFolderMenu.server/,
        hidden: true,
      }),
    ).toHaveAttribute("data-disabled", "true");
    expect(
      within(menu).getByRole("menuitem", {
        name: key("fromComputer"),
        hidden: true,
      }),
    ).not.toHaveAttribute("data-disabled");
    fireEvent.click(addFolderButton());
    fireEvent.click(screen.getByRole("radio", { name: local.name }));
    expect(button("chooseProcessing")).toBeEnabled();
  });

  it("defers folder creation until processing is enabled and retains processing choices when going back", async () => {
    const props = renderWizard();
    const progress = screen.getByRole("list", { name: key("progress") });
    expect(within(progress).getAllByRole("listitem")).toHaveLength(2);
    expect(within(progress).getByText(key("folder"))).toBeVisible();
    expect(within(progress).getByText(key("processing"))).toBeVisible();
    createServerFolder();
    expect(button("enable")).toBeEnabled();
    expect(screen.queryByRole("button", { name: key("review") })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: "portal.policies.categories.classification.label",
      }),
    );
    expect(props.resolveTarget).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "filesPage.processingSetup.back" }),
    );
    expect(screen.getByRole("radio", { name: "Receipts" })).toBeChecked();
    fireEvent.click(button("chooseProcessing"));
    expect(
      screen.getByRole("button", {
        name: "portal.policies.categories.classification.label",
      }),
    ).toHaveAttribute("aria-pressed", "true");
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
      name: "Receipts",
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
    fireEvent.click(button("enable"));
    await screen.findByText("Server unavailable");
    fireEvent.click(button("change"));
    expect(screen.getByRole("radio", { name: folder.name })).toBeChecked();
    expect(screen.queryByLabelText(new RegExp(key("folderName")))).toBeNull();
    fireEvent.click(button("chooseProcessing"));
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
    fireEvent.click(addFolderButton());
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: key("fromComputer"),
      }),
    );
    await waitFor(() => expect(pickDirectory).toHaveBeenCalledTimes(1));
    expect(button("chooseProcessing")).toBeDisabled();
    fireEvent.click(addFolderButton());
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: key("fromComputer"),
      }),
    );
    await returnToFoldersAfterAdding();
    await screen.findByRole("row", { selected: true });
    expect(screen.queryByRole("button", { name: "Invoices" })).toBeNull();
    expect(screen.queryByText("C:/Invoices")).toBeNull();
    expect(
      within(screen.getByRole("row", { selected: true })).getByRole("radio", {
        name: "Invoices",
      }),
    ).toBeChecked();
    expect(button("chooseProcessing")).toBeEnabled();
  });

  it("adds a selected native directory alongside server folders in the same list", async () => {
    const props = renderWizard({
      canPickDirectory: true,
      pickDirectory: vi
        .fn()
        .mockResolvedValue({ path: "C:/Documents", name: "Documents" }),
    });
    expect(
      screen.getByRole("button", { name: "filesPage.tree" }),
    ).toBeVisible();
    fireEvent.click(addFolderButton());
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: key("fromComputer"),
      }),
    );
    await returnToFoldersAfterAdding();
    expect(screen.getByRole("radio", { name: "Documents" })).toBeChecked();
    expect(screen.getByRole("radio", { name: folder.name })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Documents" })).toBeNull();
    expect(props.resolveTarget).not.toHaveBeenCalled();
    expect(button("chooseProcessing")).toBeEnabled();
  });

  it("shows a known nested native pick at root and preserves its selection when returning", async () => {
    const parent: FolderRecord = {
      ...folder,
      name: "Documents",
      kind: "local",
      directory: "C:/Documents",
    };
    const child: FolderRecord = {
      ...parent,
      id: createFolderId(),
      parentFolderId: parent.id,
      name: "Invoices",
      directory: "C:/Documents/Invoices",
    };
    renderWizard({
      folders: [parent, child],
      canPickDirectory: true,
      pickDirectory: vi.fn().mockResolvedValue({
        path: "c:\\DOCUMENTS\\Invoices\\",
        name: "Invoices",
      }),
    });
    fireEvent.click(addFolderButton());
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: key("fromComputer"),
      }),
    );
    await returnToFoldersAfterAdding();
    expect(screen.getByRole("radio", { name: child.name })).toBeChecked();
    expect(
      screen.getByRole("button", { name: "filesPage.tree" }),
    ).toHaveAttribute("aria-current", "location");
    expect(screen.queryByRole("button", { name: parent.name })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: parent.name }));
    expect(screen.getByRole("radio", { name: child.name })).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: child.name }));
    fireEvent.click(button("chooseProcessing"));
    fireEvent.click(button("change"));
    expect(screen.getByRole("radio", { name: child.name })).toBeChecked();
  });

  it("retains added folders when another folder is selected and allows editing a server draft", async () => {
    const props = renderWizard({
      canPickDirectory: true,
      pickDirectory: vi
        .fn()
        .mockResolvedValue({ path: "C:/Documents", name: "Documents" }),
    });
    fireEvent.click(addFolderButton());
    fireEvent.click(
      await screen.findByRole("menuitem", { name: key("fromComputer") }),
    );
    await returnToFoldersAfterAdding();
    await screen.findByRole("radio", { name: "Documents" });
    fireEvent.click(addFolderButton());
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: /filesPage.newFolderMenu.server/,
      }),
    );
    const name = screen.getByLabelText(new RegExp(key("folderName")));
    fireEvent.change(name, { target: { value: "Bad/name" } });
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(button("chooseProcessing")).toBeDisabled();
    fireEvent.change(name, { target: { value: "Receipts" } });
    addServerDraft();
    await returnToFoldersAfterAdding();
    expect(screen.getByRole("radio", { name: "Receipts" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Documents" }));
    expect(screen.getByRole("radio", { name: "Documents" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Receipts" })).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: folder.name }));
    fireEvent.click(screen.getByRole("radio", { name: "Receipts" }));
    fireEvent.click(button("editFolder"));
    expect(screen.getByLabelText(new RegExp(key("folderName")))).toHaveValue(
      "Receipts",
    );
    fireEvent.change(screen.getByLabelText(new RegExp(key("folderName"))), {
      target: { value: "Expenses" },
    });
    fireEvent.click(button("saveFolder"));
    expect(screen.getByRole("radio", { name: "Expenses" })).toBeChecked();
    expect(screen.queryByRole("radio", { name: "Receipts" })).toBeNull();
    expect(props.resolveTarget).not.toHaveBeenCalled();
  });

  it("keeps unavailable actions disabled without a server warning or computer panel", () => {
    renderWizard({
      serverDisabledReason: "Sign in first",
      downloadsProcessing: { count: 50, start: vi.fn() },
    });
    expect(
      screen.queryByRole("button", { name: key("dropHeading") }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: key("downloadsAction") }),
    ).toBeNull();
    expect(
      screen.queryByRole("columnheader", { name: "filesPage.column.modified" }),
    ).toBeNull();
    expect(addFolderButton()).toBeDisabled();
    expect(screen.queryByText("Sign in first")).toBeNull();
    expect(button("chooseProcessing")).toBeDisabled();
  });

  it("blocks saving when saved processing could not be loaded", () => {
    renderWizard({
      initialFolder: folder,
      loadError: "Could not load processing",
      onRetry: vi.fn(),
    });
    expect(screen.getByText("Could not load processing")).toBeVisible();
    expect(button("enable")).toBeDisabled();
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
    ).not.toBeDisabled();
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
    expect(button("enable")).toBeEnabled();
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

  it("mounts the output panel for every preset but Routing, and lets it block saving", () => {
    setupConfigValid.value = false;
    renderWizard({
      initialFolder: folder,
      destinations: [{ id: "archive", name: "Archive" }],
    });
    expect(screen.getByText(`output panel for ${folder.name}`)).toBeVisible();
    expect(button("enable")).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "portal.policies.categories.routing.label",
      }),
    );
    expect(
      screen.queryByText(`output panel for ${folder.name}`),
    ).not.toBeInTheDocument();
  });
});
