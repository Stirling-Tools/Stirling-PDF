import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ReviewSummary,
  type ReviewSummaryProps,
} from "@editor/tools/pdfTextEditor/components/review/ReviewSummary";

const NOTHING_TO_REVIEW = { needsDescription: 0, untagged: 0, untaggable: 0 };

function renderSummary(props: Partial<ReviewSummaryProps> = {}) {
  render(
    <MantineProvider env="test">
      <ReviewSummary
        progress={{ done: 3, total: 5, complete: true }}
        review={NOTHING_TO_REVIEW}
        untaggedPages={0}
        markedTagged={false}
        onSetMarkedTagged={vi.fn()}
        hasTags={false}
        headingOutline={null}
        onSelectHeading={vi.fn()}
        {...props}
      />
    </MantineProvider>,
  );
}

const KEY = "pdfTextEditor.inspector.accessibility";
const SUMMARY = "pdf-editor-document-accessibility-summary";
const MARKED = "pdf-editor-document-accessibility-marked";
const MARKED_WARNING = "pdf-editor-document-accessibility-marked-warning";

describe("ReviewSummary", () => {
  it("shows how much is tagged and how much is left", () => {
    renderSummary();
    expect(screen.getByText("3/5")).toBeVisible();
    expect(screen.getByTestId("pdf-editor-review-score")).toHaveTextContent(
      "pdfTextEditor.review.left",
    );
  });

  it("says so once everything is tagged", () => {
    renderSummary({ progress: { done: 5, total: 5, complete: true } });
    expect(screen.getByTestId("pdf-editor-review-score")).toHaveTextContent(
      "pdfTextEditor.review.allDone",
    );
  });

  it("counts images missing descriptions, untagged ones and pages to tag", () => {
    renderSummary({
      review: { needsDescription: 2, untagged: 1, untaggable: 0 },
      untaggedPages: 3,
    });
    expect(screen.getByTestId(SUMMARY)).toHaveTextContent(
      `${KEY}.missingDescriptions2${KEY}.untaggedImages1${KEY}.untaggedPages3`,
    );
  });

  it("counts images that can't be tagged apart", () => {
    renderSummary({
      review: { needsDescription: 0, untagged: 0, untaggable: 2 },
    });
    expect(screen.getByTestId(SUMMARY)).toHaveTextContent(
      `${KEY}.untaggableImages2`,
    );
  });

  it("leaves the counts out when the file is not treated as tagged", () => {
    renderSummary({ review: null });
    expect(screen.queryByTestId(SUMMARY)).not.toBeInTheDocument();
  });

  it("ticks the fully-tagged box to mark the document", () => {
    const onSetMarkedTagged = vi.fn();
    renderSummary({ onSetMarkedTagged });
    const box = screen.getByTestId(MARKED);
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(onSetMarkedTagged).toHaveBeenCalledWith(true);
  });

  it("leaves the box out when the file's flag can't be changed", () => {
    renderSummary({ markedTagged: null });
    expect(screen.queryByTestId(MARKED)).not.toBeInTheDocument();
  });

  it("warns when marked tagged while content is untagged", () => {
    renderSummary({ markedTagged: true, untaggedPages: 2 });
    expect(screen.getByTestId(MARKED_WARNING)).toHaveTextContent(
      `${KEY}.markedWithUntagged`,
    );
  });

  it("warns when tags exist but the document isn't marked tagged", () => {
    renderSummary({ hasTags: true });
    expect(screen.getByTestId(MARKED_WARNING)).toHaveTextContent(
      `${KEY}.unmarkedWithTags`,
    );
  });

  it("shows no warning when the flag matches the tags", () => {
    renderSummary({ markedTagged: true });
    expect(screen.queryByTestId(MARKED_WARNING)).not.toBeInTheDocument();
  });

  it("lists the headings when there are any to check", () => {
    renderSummary({
      headingOutline: { entries: [], mixesNumbering: false },
    });
    expect(screen.getByTestId("pdf-editor-heading-outline")).toBeVisible();
  });
});
