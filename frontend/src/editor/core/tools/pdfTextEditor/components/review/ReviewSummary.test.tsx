import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
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
        headingOutline={null}
        onSelectHeading={vi.fn()}
        {...props}
      />
    </MantineProvider>,
  );
}

const KEY = "pdfTextEditor.inspector.accessibility";
const SUMMARY = "pdf-editor-document-accessibility-summary";
const PAGES = "pdfTextEditor.review.summary.untaggedPages";

describe("ReviewSummary", () => {
  it("shows how much is tagged and how much is left", () => {
    renderSummary();
    const score = screen.getByTestId("pdf-editor-review-score");
    expect(score).toHaveTextContent("pdfTextEditor.review.summary.tagged");
    expect(score).toHaveTextContent("pdfTextEditor.review.left");
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
      `${KEY}.missingDescriptions2${KEY}.untaggedImages1${PAGES}3`,
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

  it("leaves out what has nothing left in it", () => {
    renderSummary({
      review: { needsDescription: 0, untagged: 0, untaggable: 0 },
      untaggedPages: 1,
    });
    expect(screen.getByTestId(SUMMARY)).toHaveTextContent(`${PAGES}1`);
    expect(screen.getByTestId(SUMMARY)).not.toHaveTextContent(
      `${KEY}.missingDescriptions`,
    );
  });

  it("leaves the list out once nothing is left", () => {
    renderSummary();
    expect(screen.queryByTestId(SUMMARY)).not.toBeInTheDocument();
  });

  it("leaves the counts out when the file is not treated as tagged", () => {
    renderSummary({ review: null });
    expect(screen.queryByTestId(SUMMARY)).not.toBeInTheDocument();
  });

  it("has no fully-tagged checkbox: the report's fix flags the document", () => {
    renderSummary();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("flags heading problems beside the Headings title", () => {
    renderSummary({
      headingOutline: { entries: [], mixesNumbering: true },
    });
    expect(screen.getByTestId("pdf-editor-heading-problems")).toHaveTextContent(
      `${KEY}.outline.problemCount`,
    );
  });

  it("shows no problem count when the headings are fine", () => {
    renderSummary({
      headingOutline: { entries: [], mixesNumbering: false },
    });
    expect(
      screen.queryByTestId("pdf-editor-heading-problems"),
    ).not.toBeInTheDocument();
  });

  it("lists the headings when there are any to check", () => {
    renderSummary({
      headingOutline: { entries: [], mixesNumbering: false },
    });
    expect(screen.getByTestId("pdf-editor-heading-outline")).toBeVisible();
  });
});
