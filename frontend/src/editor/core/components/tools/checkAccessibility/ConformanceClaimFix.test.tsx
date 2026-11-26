import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ConformanceClaimContext,
  ConformanceClaimField,
  DeclareConformanceButton,
} from "@editor/components/tools/checkAccessibility/ConformanceClaimFix";
import type { CheckedFileClaim } from "@editor/hooks/tools/checkAccessibility/useConformanceClaimControl";
import { reviewConformanceClaim } from "@editor/tools/pdfTextEditor/store/reviewConformanceClaim";
import type { AccessibilityIssue } from "@editor/types/checkAccessibility";
import type { FileId } from "@editor/types/file";

const CHECKED = "checked" as FileId;

const NO_CLAIM: AccessibilityIssue = {
  clause: "5",
  testNumber: "1",
  specification: "PDF/UA-1",
  message: "",
  severity: "error",
  occurrences: 1,
  autoFixable: false,
};

function control(overrides: Partial<CheckedFileClaim> = {}): CheckedFileClaim {
  return {
    fileId: CHECKED,
    declared: false,
    editable: true,
    writing: false,
    write: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  reviewConformanceClaim.set(null);
});

function renderWith(claim: CheckedFileClaim | null, ui: ReactNode) {
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
    expect(claim.write).toHaveBeenCalledWith(1);
  });

  it("shows a declaration the review already holds", () => {
    reviewConformanceClaim.set({
      fileId: CHECKED,
      part: 1,
      editable: true,
      set: vi.fn(),
    });
    renderWith(control(), <DeclareConformanceButton issue={NO_CLAIM} />);
    const button = screen.getByTestId("a11y-declare-conformance");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("checkAccessibility.claim.declared");
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
    expect(claim.write).toHaveBeenCalledWith(2);
  });

  it("withdraws the claim when unticked", () => {
    const claim = control({ declared: true });
    renderWith(claim, <ConformanceClaimField part={1} />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(claim.write).toHaveBeenCalledWith(null);
  });

  it("is locked while the file is rewritten", () => {
    renderWith(control({ writing: true }), <ConformanceClaimField part={1} />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});
