import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AccessibilityFixContext,
  IssueFixButton,
  UntaggedContentContext,
} from "@editor/components/tools/checkAccessibility/AccessibilityFix";
import type { AccessibilityIssue } from "@editor/types/checkAccessibility";

function issue(clause: string, testNumber: string): AccessibilityIssue {
  return {
    specification: "PDF/UA-1",
    clause,
    testNumber,
    message: "",
    severity: "error",
    occurrences: 1,
    autoFixable: false,
  };
}

const NOT_MARKED = issue("6.2", "1");
const UNTAGGED = issue("7.1", "3");

function renderFix(target: AccessibilityIssue, untaggedLeft: boolean) {
  render(
    <MantineProvider env="test">
      <AccessibilityFixContext.Provider value={vi.fn()}>
        <UntaggedContentContext.Provider value={untaggedLeft}>
          <IssueFixButton issue={target} />
        </UntaggedContentContext.Provider>
      </AccessibilityFixContext.Provider>
    </MantineProvider>,
  );
  return screen.getByTestId("a11y-fix-issue");
}

describe("IssueFixButton", () => {
  it("warns beside Mark as tagged while content is still untagged", () => {
    const button = renderFix(NOT_MARKED, true);
    const caution = screen.getByTestId("a11y-fix-caution");
    expect(caution).toHaveTextContent(
      "checkAccessibility.fix.markedTaggedUntagged",
    );
    expect(button).toHaveAttribute("aria-describedby", caution.id);
  });

  it("marks as tagged without a warning once everything is tagged", () => {
    const button = renderFix(NOT_MARKED, false);
    expect(screen.queryByTestId("a11y-fix-caution")).toBeNull();
    expect(button).not.toHaveAttribute("aria-describedby");
  });

  it("keeps the warning to the tagged flag's fix", () => {
    renderFix(UNTAGGED, true);
    expect(screen.queryByTestId("a11y-fix-caution")).toBeNull();
  });
});
