import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentInspector } from "@editor/tools/pdfTextEditor/components/inspector/DocumentInspector";
import type { DocumentLanguageControl } from "@editor/tools/pdfTextEditor/hooks/useDocumentLanguage";
import type { ImageReview } from "@editor/tools/pdfTextEditor/util/imageAccessibility";

function renderInspector(
  imageReview: ImageReview | null,
  onNext = vi.fn(),
  documentLanguage: DocumentLanguageControl | null = null,
) {
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
        headingOutline={null}
        onSelectHeading={vi.fn()}
        documentLanguage={documentLanguage}
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

describe("DocumentInspector language", () => {
  const LANGUAGE_KEY = "pdfTextEditor.inspector.language";
  const MISSING = "pdf-editor-document-language-missing";
  const language = (
    lang: string | null,
    editable = true,
  ): DocumentLanguageControl => ({
    language: lang,
    editable,
    onSet: vi.fn(),
  });

  function picker(): HTMLInputElement {
    return screen.getByRole("textbox", {
      name: `${LANGUAGE_KEY}.documentLabel`,
    });
  }

  it("flags a document with no language and sets one", () => {
    const control = language(null);
    renderInspector(null, vi.fn(), control);
    expect(screen.getByTestId(MISSING)).toBeVisible();
    expect(picker()).toHaveValue(`${LANGUAGE_KEY}.unknown`);
    fireEvent.click(picker());
    const options = document.getElementById(
      picker().getAttribute("aria-controls")!,
    )!;
    fireEvent.click(
      within(options).getByRole("option", { name: /(^|\()en-IE\)?$/ }),
    );
    expect(control.onSet).toHaveBeenCalledWith("en-IE");
  });

  it("shows the document's language without flagging it", () => {
    renderInspector(null, vi.fn(), language("fr"));
    expect(picker().value).toMatch(/(^|\()fr\)?$/);
    expect(screen.queryByTestId(MISSING)).not.toBeInTheDocument();
  });

  it("disables the picker where the language can't be saved", () => {
    renderInspector(null, vi.fn(), language("fr", false));
    expect(picker()).toBeDisabled();
  });

  it("leaves the language out when it can't be edited here", () => {
    renderInspector(null);
    expect(
      screen.queryByTestId("pdf-editor-document-language-picker"),
    ).not.toBeInTheDocument();
  });
});
