import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccessibilityManualChecks } from "@editor/components/tools/checkAccessibility/AccessibilityManualChecks";

const CHECKS = ["Is the reading order correct?", "Do descriptions make sense?"];

function renderChecks(ticked: number[] = []) {
  render(
    <MantineProvider env="test">
      <AccessibilityManualChecks
        checks={CHECKS}
        ticked={new Set(ticked)}
        onToggle={vi.fn()}
        onSetAll={vi.fn()}
      />
    </MantineProvider>,
  );
  return screen.getByRole("button", {
    name: /checkAccessibility\.manual\.title/,
  });
}

describe("AccessibilityManualChecks", () => {
  it("starts collapsed and opens from its header", () => {
    const header = renderChecks();
    expect(header).toHaveAttribute("aria-expanded", "false");
    const body = document.getElementById(header.getAttribute("aria-controls")!);
    expect(body).toHaveAttribute("inert");
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(body).not.toHaveAttribute("inert");
  });

  it("is in progress until every check is ticked", () => {
    renderChecks([0]);
    expect(screen.getByTestId("a11y-manual-status")).toHaveTextContent(
      "checkAccessibility.manual.inProgress",
    );
  });

  it("is done once every check is ticked", () => {
    renderChecks([0, 1]);
    expect(screen.getByTestId("a11y-manual-status")).toHaveTextContent(
      "checkAccessibility.manual.done",
    );
  });
});
