import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReviewStepper } from "@editor/tools/pdfTextEditor/components/review/ReviewStepper";
import type { ReviewProgress } from "@editor/tools/pdfTextEditor/hooks/useAccessibilityProgress";
import type { ReviewItem } from "@editor/tools/pdfTextEditor/util/accessibilityProgress";

const TODO: ReviewItem = {
  kind: "text",
  id: "run-1",
  pageIndex: 0,
  bounds: { x: 0, y: 0, width: 10, height: 10 },
  status: "todo",
};

function progress(todoCount: number): ReviewProgress {
  const items = todoCount ? [TODO] : [{ ...TODO, status: "done" as const }];
  return {
    items,
    done: todoCount ? 0 : 1,
    total: 1,
    complete: true,
    current: null,
    next: todoCount ? TODO : null,
    previous: null,
    todoPosition: null,
    todoCount,
    select: vi.fn(),
  };
}

function stepper(todoCount: number) {
  return (
    <MantineProvider env="test">
      <ReviewStepper review={progress(todoCount)} />
    </MantineProvider>
  );
}

describe("ReviewStepper", () => {
  it("steps through what is left to tag", () => {
    render(stepper(1));
    expect(screen.getByTestId("pdf-editor-review-next")).toBeEnabled();
    expect(
      screen.getByTestId("pdf-editor-review-stepper-label"),
    ).toHaveTextContent("pdfTextEditor.review.untaggedCount");
  });

  it("drops the arrows and announces it once nothing is left", () => {
    const { rerender } = render(stepper(1));
    const label = screen.getByTestId("pdf-editor-review-stepper-label");
    rerender(stepper(0));
    // The same live region, so the change is announced rather than mounted silently.
    expect(screen.getByTestId("pdf-editor-review-stepper-label")).toBe(label);
    expect(label).toHaveAttribute("aria-live", "polite");
    expect(label).toHaveTextContent("pdfTextEditor.review.allDone");
    expect(screen.queryByTestId("pdf-editor-review-next")).toBeNull();
    expect(screen.queryByTestId("pdf-editor-review-previous")).toBeNull();
  });
});
