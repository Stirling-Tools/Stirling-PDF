import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  ConformanceClaimContext,
  ConformanceClaimField,
  DeclareConformanceButton,
} from "@editor/components/tools/checkAccessibility/ConformanceClaimFix";
import type { ConformanceClaimControl } from "@editor/hooks/tools/checkAccessibility/useConformanceClaimControl";
import type { AccessibilityIssue } from "@editor/types/checkAccessibility";

const NO_CLAIM: AccessibilityIssue = {
  clause: "5",
  testNumber: "1",
  specification: "PDF/UA-1",
  message: "",
  severity: "error",
  occurrences: 1,
  autoFixable: false,
};

function control(
  overrides: Partial<ConformanceClaimControl> = {},
): ConformanceClaimControl {
  return {
    declared: false,
    part: null,
    editable: true,
    writing: false,
    set: vi.fn(),
    ...overrides,
  };
}

function renderWith(claim: ConformanceClaimControl | null, ui: ReactNode) {
  render(
    <MantineProvider env="test">
      <ConformanceClaimContext.Provider value={claim}>
        {ui}
      </ConformanceClaimContext.Provider>
    </MantineProvider>,
  );
}

describe("DeclareConformanceButton", () => {
  it("declares the part the issue was checked against", () => {
    const claim = control();
    renderWith(claim, <DeclareConformanceButton issue={NO_CLAIM} />);
    fireEvent.click(screen.getByTestId("a11y-declare-conformance"));
    expect(claim.set).toHaveBeenCalledWith(1);
  });

  it("shows a declaration the review already holds", () => {
    renderWith(
      control({ declared: true, part: 1 }),
      <DeclareConformanceButton issue={NO_CLAIM} />,
    );
    const button = screen.getByTestId("a11y-declare-conformance");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(
      "checkAccessibility.fix.conformanceDeclared",
    );
  });

  it("is not offered where the claim cannot be changed", () => {
    renderWith(
      control({ editable: false }),
      <DeclareConformanceButton issue={NO_CLAIM} />,
    );
    expect(screen.queryByTestId("a11y-declare-conformance")).toBeNull();
  });

  it("is not offered for an issue declaring does not fix", () => {
    renderWith(
      control(),
      <DeclareConformanceButton issue={{ ...NO_CLAIM, clause: "6.2" }} />,
    );
    expect(screen.queryByTestId("a11y-declare-conformance")).toBeNull();
  });
});

describe("ConformanceClaimField", () => {
  it("declares the part when ticked", () => {
    const claim = control();
    renderWith(claim, <ConformanceClaimField part={2} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(claim.set).toHaveBeenCalledWith(2);
  });

  it("withdraws the claim when unticked", () => {
    const claim = control({ declared: true });
    renderWith(claim, <ConformanceClaimField part={1} />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(claim.set).toHaveBeenCalledWith(null);
  });

  it("is locked while the file is rewritten", () => {
    renderWith(control({ writing: true }), <ConformanceClaimField part={1} />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});
