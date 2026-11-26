import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AccessibilityFixContext,
  IssueFixButton,
} from "@editor/components/tools/checkAccessibility/AccessibilityFix";
import {
  MarkedTaggedContext,
  MarkedTaggedField,
  type CheckedFileMarkedTagged,
} from "@editor/components/tools/checkAccessibility/MarkedTaggedFix";
import { reviewMarkedTagged } from "@editor/tools/pdfTextEditor/store/reviewMarkedTagged";
import type { AccessibilityIssue } from "@editor/types/checkAccessibility";
import type { FileId } from "@editor/types/file";

const CHECKED = "checked" as FileId;

const NOT_MARKED: AccessibilityIssue = {
  clause: "6.2",
  testNumber: "1",
  specification: "PDF/UA-1",
  message: "",
  severity: "error",
  occurrences: 1,
  autoFixable: false,
};

function control(
  overrides: Partial<CheckedFileMarkedTagged> = {},
): CheckedFileMarkedTagged {
  return {
    fileId: CHECKED,
    marked: false,
    editable: true,
    request: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  reviewMarkedTagged.set(null);
});

function renderWith(flag: CheckedFileMarkedTagged | null, ui: ReactNode) {
  render(
    <MantineProvider env="test">
      <AccessibilityFixContext.Provider value={vi.fn()}>
        <MarkedTaggedContext.Provider value={flag}>
          {ui}
        </MarkedTaggedContext.Provider>
      </AccessibilityFixContext.Provider>
    </MantineProvider>,
  );
}

describe("MarkedTaggedField", () => {
  it("asks the review to mark the file when ticked", () => {
    const flag = control();
    renderWith(flag, <MarkedTaggedField untaggedLeft={false} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(flag.request).toHaveBeenCalledWith(true);
  });

  it("shows the review's unsaved flag and withdraws it there when unticked", () => {
    const set = vi.fn();
    reviewMarkedTagged.set({
      fileId: CHECKED,
      marked: true,
      editable: true,
      set,
    });
    const flag = control();
    renderWith(flag, <MarkedTaggedField untaggedLeft={false} />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(set).toHaveBeenCalledWith(false);
    expect(flag.request).not.toHaveBeenCalled();
  });

  it("ignores the review while it has another file open", () => {
    reviewMarkedTagged.set({
      fileId: "other" as FileId,
      marked: true,
      editable: true,
      set: vi.fn(),
    });
    renderWith(control(), <MarkedTaggedField untaggedLeft={false} />);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("warns while content is left untagged", () => {
    renderWith(control(), <MarkedTaggedField untaggedLeft />);
    expect(screen.getByTestId("a11y-marked-tagged-caution")).toBeTruthy();
  });

  it("is locked where the flag cannot be changed", () => {
    renderWith(
      control({ editable: false }),
      <MarkedTaggedField untaggedLeft={false} />,
    );
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});

describe("IssueFixButton for the tagged flag", () => {
  it("marks the file", () => {
    const flag = control();
    renderWith(flag, <IssueFixButton issue={NOT_MARKED} />);
    fireEvent.click(screen.getByTestId("a11y-fix-issue"));
    expect(flag.request).toHaveBeenCalledWith(true);
  });

  it("shows a flag the review already holds", () => {
    reviewMarkedTagged.set({
      fileId: CHECKED,
      marked: true,
      editable: true,
      set: vi.fn(),
    });
    renderWith(control(), <IssueFixButton issue={NOT_MARKED} />);
    const button = screen.getByTestId("a11y-fix-issue");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("checkAccessibility.fix.markedTaggedDone");
  });
});
