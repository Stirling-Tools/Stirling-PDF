import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";
import {
  ProcessingFolderWizard,
  type ProcessingFolderWizardProps,
} from "@app/components/policies/ProcessingFolderWizard";
import { createFolderId, type FolderRecord } from "@app/types/folder";

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
  fireEvent.click(screen.getByRole("radio", { name: key("newFolder") }));
  fireEvent.change(screen.getByLabelText(new RegExp(key("folderName"))), {
    target: { value: "Invoices" },
  });
  fireEvent.click(button("chooseProcessing"));
}

describe("ProcessingFolderWizard", () => {
  it("defers folder creation until review and retains processing choices when going back", async () => {
    const props = renderWizard();
    createServerFolder();
    fireEvent.click(
      screen.getByRole("button", { name: /presets.classification.title/ }),
    );
    expect(props.resolveTarget).not.toHaveBeenCalled();
    fireEvent.click(button("review"));
    expect(screen.getByText(key("serverResult"))).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "filesPage.processingSetup.back" }),
    );
    fireEvent.click(button("change"));
    expect(screen.getByLabelText(new RegExp(key("folderName")))).toHaveValue(
      "Invoices",
    );
    fireEvent.click(button("chooseProcessing"));
    expect(
      screen.getByRole("button", { name: /presets.classification.title/ }),
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
    expect(
      screen.getByRole("radio", { name: key("useExisting") }),
    ).toBeChecked();
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

  it("skips folder selection when editing and reviews the paused state", async () => {
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
    expect(screen.getByText(key("staysPaused"))).toBeVisible();
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

  it("disables classification when the AI engine is unavailable", () => {
    renderWizard({ initialFolder: folder, aiEngineEnabled: false });
    expect(
      screen.getByRole("button", { name: /presets.classification.title/ }),
    ).toBeDisabled();
    expect(button("review")).toBeEnabled();
  });
});
