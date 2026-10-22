import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentInspector } from "@editor/tools/pdfTextEditor/components/inspector/DocumentInspector";
import type { ImageReview } from "@editor/tools/pdfTextEditor/util/imageAccessibility";

function renderInspector(imageReview: ImageReview | null, onNext = vi.fn()) {
  render(
    <MantineProvider env="test">
      <DocumentInspector
        pages={[]}
        groupingMode="auto"
        widthMode="grow"
        showRulers={false}
        onSetGroupingMode={vi.fn()}
        onSetWidthMode={vi.fn()}
        onSetShowRulers={vi.fn()}
        imageReview={imageReview}
        onSelectNextImageToReview={onNext}
      />
    </MantineProvider>,
  );
  return onNext;
}

const KEY = "pdfTextEditor.inspector.accessibility";
const SUMMARY = "pdf-editor-document-accessibility-summary";
const NEXT = "pdf-editor-document-accessibility-next";

describe("DocumentInspector accessibility review", () => {
  it("lists images needing descriptions and untagged ones, and moves to the next", () => {
    const onNext = renderInspector({ needsDescription: 2, untagged: 1 });
    const summary = screen.getByTestId(SUMMARY);
    expect(summary).toHaveTextContent(`${KEY}.remaining`);
    expect(summary).toHaveTextContent(`${KEY}.untagged`);
    expect(summary).not.toHaveTextContent(`${KEY}.allDescribed`);
    fireEvent.click(screen.getByTestId(NEXT));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("does not call a document with only untagged images done", () => {
    renderInspector({ needsDescription: 0, untagged: 1 });
    const summary = screen.getByTestId(SUMMARY);
    expect(summary).toHaveTextContent(`${KEY}.untagged`);
    expect(summary).not.toHaveTextContent(`${KEY}.allDescribed`);
    expect(screen.getByTestId(NEXT)).toBeVisible();
  });

  it("says when every image is dealt with", () => {
    renderInspector({ needsDescription: 0, untagged: 0 });
    expect(screen.getByTestId(SUMMARY)).toHaveTextContent(
      `${KEY}.allDescribed`,
    );
    expect(screen.queryByTestId(NEXT)).not.toBeInTheDocument();
  });

  it("leaves the review out when there is nothing to review", () => {
    renderInspector(null);
    expect(
      screen.queryByTestId("pdf-editor-document-accessibility"),
    ).not.toBeInTheDocument();
  });
});
