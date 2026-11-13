import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import AutomationSelection from "@editor/components/tools/automate/AutomationSelection";

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
  default: () => null,
}));

describe("AutomationSelection activity section", () => {
  test("uses a heading that holds for chains from any scope", () => {
    render(
      <MantineProvider>
        <AutomationSelection
          savedAutomations={[]}
          onCreateNew={vi.fn()}
          onRun={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onCopyFromSuggested={vi.fn()}
          onCreateFromActivity={vi.fn()}
          onImportAutomation={vi.fn()}
          toolRegistry={{}}
        />
      </MantineProvider>,
    );

    expect(screen.getByText("From how people work")).toBeTruthy();
    expect(screen.queryByText("From your activity")).toBeNull();
    expect(
      screen.getByText("Colleagues ran this {{count, number}} times"),
    ).toBeTruthy();
  });
});
