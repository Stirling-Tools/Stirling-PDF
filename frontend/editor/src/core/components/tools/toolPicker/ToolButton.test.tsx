import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

import ToolButton from "@app/components/tools/toolPicker/ToolButton";
import {
  SubcategoryId,
  ToolCategoryId,
  ToolRegistryEntry,
} from "@app/data/toolsTaxonomy";

vi.mock("@app/contexts/ToolWorkflowContext", () => ({
  useToolWorkflowData: () => ({
    isFavorite: () => false,
    toolAvailability: {},
  }),
  useToolWorkflowActions: () => ({ toggleFavorite: vi.fn() }),
}));
vi.mock("@app/contexts/HotkeyContext", () => ({
  useHotkeys: () => ({ hotkeys: {} }),
}));
vi.mock("@app/hooks/useToolNavigation", () => ({
  useToolNavigation: () => ({ getToolNavigation: () => null }),
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: {} }),
}));
vi.mock("@app/hooks/useWillUseCloud", () => ({
  useWillUseCloud: () => false,
}));
// Tooltip pulls in preferences/logo providers irrelevant to this test.
vi.mock("@app/components/shared/Tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const tool: ToolRegistryEntry = {
  icon: null,
  name: "OCR",
  component: (() => null) as never,
  description: "Recognise text",
  categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
  subcategoryId: SubcategoryId.EXTRACTION,
  automationSettings: null,
} as ToolRegistryEntry;

const renderButton = (props: Partial<Parameters<typeof ToolButton>[0]> = {}) =>
  render(
    <MantineProvider>
      <ToolButton
        id={"ocr" as never}
        tool={tool}
        isSelected={false}
        onSelect={vi.fn()}
        {...props}
      />
    </MantineProvider>,
  );

describe("ToolButton dismiss control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders no dismiss control by default", () => {
    renderButton();

    expect(
      screen.queryByLabelText("toolPicker.recommendations.dismiss"),
    ).not.toBeInTheDocument();
  });

  it("renders the dismiss X when onDismiss is provided", () => {
    renderButton({ onDismiss: vi.fn() });

    expect(
      screen.getByLabelText("toolPicker.recommendations.dismiss"),
    ).toBeInTheDocument();
  });

  it("clicking the X fires onDismiss without selecting the tool", () => {
    const onDismiss = vi.fn();
    const onSelect = vi.fn();
    renderButton({ onDismiss, onSelect });

    fireEvent.click(
      screen.getByLabelText("toolPicker.recommendations.dismiss"),
    );

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("clicking the tool itself still selects it", () => {
    const onSelect = vi.fn();
    renderButton({ onDismiss: vi.fn(), onSelect });

    fireEvent.click(screen.getByText("OCR"));

    expect(onSelect).toHaveBeenCalledWith("ocr");
  });

  it("exposes the X as a keyboard-reachable button to assistive tech", () => {
    renderButton({ onDismiss: vi.fn() });

    // aria-label is ARIA-prohibited on a bare span, so role is what makes it nameable.
    const dismissButton = screen.getByRole("button", {
      name: "toolPicker.recommendations.dismiss",
    });
    expect(dismissButton).toHaveAttribute("tabindex", "0");
  });

  it.each(["Enter", " "])("pressing %s on the X fires onDismiss", (key) => {
    const onDismiss = vi.fn();
    const onSelect = vi.fn();
    renderButton({ onDismiss, onSelect });

    fireEvent.keyDown(
      screen.getByLabelText("toolPicker.recommendations.dismiss"),
      { key },
    );

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
