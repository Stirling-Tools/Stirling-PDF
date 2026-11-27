import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import AutomationSelection from "@editor/components/tools/automate/AutomationSelection";
import type { AutomationConfig } from "@editor/types/automation";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

vi.mock("@editor/hooks/tools/automate/useSuggestedAutomations", () => ({
  useSuggestedAutomations: () => [],
}));

vi.mock("@editor/hooks/tools/automate/useActivityAutomations", () => ({
  useActivityAutomations: () => [
    { operations: ["compress", "flatten"], fileCount: 300, scope: "install" },
  ],
}));

vi.mock("@editor/components/tools/automate/AutomationImportModal", () => ({
  default: ({ opened }: { opened: boolean }) =>
    opened ? <div role="dialog">import modal</div> : null,
}));

const saved: AutomationConfig = {
  id: "a1",
  name: "Invoice cleanup",
  icon: "CompressIcon",
  operations: [
    { operation: "rotate", parameters: {} },
    { operation: "compress", parameters: {} },
  ],
  createdAt: "",
  updatedAt: "",
};

function renderSelection(
  overrides: Partial<Parameters<typeof AutomationSelection>[0]> = {},
) {
  const props = {
    savedAutomations: [],
    onCreateNew: vi.fn(),
    onOpenSaved: vi.fn(),
    onOpenSuggested: vi.fn(),
    savedActions: () => [],
    suggestedActions: () => [],
    onCreateFromActivity: vi.fn(),
    onImportAutomation: vi.fn(),
    toolRegistry: {},
    ...overrides,
  };
  render(
    <MantineProvider>
      <AutomationSelection {...props} />
    </MantineProvider>,
  );
  return props;
}

describe("AutomationSelection", () => {
  test("uses a heading that holds for chains from any scope", () => {
    renderSelection();
    expect(screen.getByText("Frequent workflows")).toBeTruthy();
    expect(screen.queryByText("From your activity")).toBeNull();
  });

  test("offers New and Import as visible header actions", () => {
    const props = renderSelection();
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    expect(props.onCreateNew).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  test("leaves out the Saved section when nothing is saved", () => {
    renderSelection();
    expect(screen.queryByRole("heading", { name: /^Saved/ })).toBeNull();
    renderSelection({ savedAutomations: [saved] });
    expect(screen.getByRole("heading", { name: /^Saved/ })).toBeTruthy();
  });

  test("opens a saved automation on click", () => {
    const props = renderSelection({ savedAutomations: [saved] });
    const row = screen.getByRole("button", { name: "Invoice cleanup" });
    fireEvent.click(row);
    expect(props.onOpenSaved).toHaveBeenCalledWith(saved);
  });
});
