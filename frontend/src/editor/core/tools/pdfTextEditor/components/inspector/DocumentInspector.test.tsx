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
  it("counts images missing descriptions and untagged ones, and moves to the next", () => {
    const onNext = renderInspector({
      needsDescription: 2,
      untagged: 1,
      untaggable: 0,
    });
    expect(screen.getByTestId(SUMMARY)).toHaveTextContent(
      `${KEY}.missingDescriptions2${KEY}.untaggedImages1`,
    );
    fireEvent.click(screen.getByTestId(NEXT));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("offers the next image while any is untagged", () => {
    renderInspector({ needsDescription: 0, untagged: 1, untaggable: 0 });
    expect(screen.getByTestId(NEXT)).toBeVisible();
  });

  it("counts images that can't be tagged apart, without offering them", () => {
    renderInspector({ needsDescription: 0, untagged: 0, untaggable: 2 });
    expect(screen.getByTestId(SUMMARY)).toHaveTextContent(
      `${KEY}.missingDescriptions0${KEY}.untaggedImages0${KEY}.untaggableImages2`,
    );
    expect(screen.queryByTestId(NEXT)).not.toBeInTheDocument();
  });

  it("offers no next image once every image is dealt with", () => {
    renderInspector({ needsDescription: 0, untagged: 0, untaggable: 0 });
    expect(screen.getByTestId(SUMMARY)).toHaveTextContent(
      `${KEY}.missingDescriptions0${KEY}.untaggedImages0`,
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
