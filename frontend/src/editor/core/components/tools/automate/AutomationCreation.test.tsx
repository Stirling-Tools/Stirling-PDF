import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import AutomationCreation from "@editor/components/tools/automate/AutomationCreation";
import {
  AutomationMode,
  type AutomationConfig,
} from "@editor/types/automation";
import type { ToolRegistry } from "@editor/data/toolsTaxonomy";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

const storage = vi.hoisted(() => ({
  saveAutomation: vi.fn(),
  updateAutomation: vi.fn(),
}));
vi.mock("@editor/services/automationStorage", () => ({
  automationStorage: storage,
}));

const registry = {
  compress: {
    name: "Compress",
    automationSettings: null,
    operationConfig: { defaultParameters: { compressionLevel: 5 } },
  },
} as unknown as Partial<ToolRegistry>;

const existing: AutomationConfig = {
  id: "a1",
  name: "Invoice cleanup",
  icon: "CompressIcon",
  operations: [{ operation: "compress", parameters: { compressionLevel: 7 } }],
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

function renderBuilder(mode: AutomationMode, onBack = vi.fn()) {
  const onComplete = vi.fn();
  render(
    <MantineProvider>
      <AutomationCreation
        mode={mode}
        existingAutomation={
          mode === AutomationMode.CREATE ? undefined : existing
        }
        onBack={onBack}
        onComplete={onComplete}
        toolRegistry={registry}
      />
    </MantineProvider>,
  );
  return { onBack, onComplete };
}

describe("AutomationCreation", () => {
  beforeEach(() => {
    storage.saveAutomation.mockReset();
    storage.updateAutomation.mockReset();
  });

  test("renaming in edit mode updates the same automation", async () => {
    storage.updateAutomation.mockImplementation(async (a) => a);
    const { onComplete } = renderBuilder(AutomationMode.EDIT);

    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: "Invoices for email" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(storage.saveAutomation).not.toHaveBeenCalled();
    expect(storage.updateAutomation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a1", name: "Invoices for email" }),
    );
  });

  test("Cancel with unsaved changes asks before leaving", async () => {
    const { onBack } = renderBuilder(AutomationMode.EDIT);
    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: "Changed" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onBack).not.toHaveBeenCalled();
    expect(await screen.findByText("Discard changes?")).toBeTruthy();

    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  test("Cancel with nothing changed leaves straight away", () => {
    const { onBack } = renderBuilder(AutomationMode.EDIT);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  test("says why Save is unavailable", () => {
    renderBuilder(AutomationMode.CREATE);
    expect(
      screen.getByRole("button", { name: "Save" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByTestId("automation-save-blocker").textContent).toBe(
      "Name the automation to save it.",
    );
  });
});
