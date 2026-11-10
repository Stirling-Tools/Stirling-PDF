import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImageAccessibilitySection } from "@editor/tools/pdfTextEditor/components/inspector/ImageAccessibilitySection";
import type {
  ImageAccessibility,
  ImageReview,
} from "@editor/tools/pdfTextEditor/util/imageAccessibility";

function renderSection(
  accessibility: ImageAccessibility,
  {
    review = { needsDescription: 0, untagged: 0, untaggable: 0 },
    onSetDescription = vi.fn(),
    onSetDecorative = vi.fn(),
    onNext = vi.fn(),
  } = {},
) {
  render(
    <MantineProvider env="test">
      <ImageAccessibilitySection
        accessibility={accessibility}
        onSetDescription={onSetDescription}
        onSetDecorative={onSetDecorative}
        review={review}
        onNext={onNext}
      />
    </MantineProvider>,
  );
  return { onSetDescription, onSetDecorative, onNext };
}

const KEY = "pdfTextEditor.inspector.accessibility";
const FIELD = "pdf-editor-image-description";
const DECORATIVE = "pdf-editor-image-decorative";
const NEXT = "pdf-editor-image-description-next";

const describable = (
  description: string | null,
  canBeDecorative = true,
): ImageAccessibility => ({
  kind: "describable",
  description,
  tagged: true,
  canBeDecorative,
});
const taggable: ImageAccessibility = {
  kind: "describable",
  description: null,
  tagged: false,
  canBeDecorative: true,
};
const untagged: ImageAccessibility = {
  kind: "blocked",
  blocker: "untagged",
  documentTagged: true,
};

describe("ImageAccessibilitySection", () => {
  it("edits the description", () => {
    const { onSetDescription } = renderSection(describable("Bar chart"));
    const field = screen.getByTestId(FIELD);
    expect(field).toHaveValue("Bar chart");
    fireEvent.change(field, { target: { value: "Bar chart of revenue" } });
    expect(onSetDescription).toHaveBeenCalledWith("Bar chart of revenue");
  });

  it("offers to describe an untagged image or mark it decorative", () => {
    const { onSetDescription } = renderSection(taggable);
    fireEvent.change(screen.getByTestId(FIELD), {
      target: { value: "A logo" },
    });
    expect(onSetDescription).toHaveBeenCalledWith("A logo");
    expect(screen.getByTestId(DECORATIVE)).toBeEnabled();
  });

  it.each<[ImageAccessibility, string]>([
    [
      { kind: "blocked", blocker: "untagged", documentTagged: false },
      "untaggedDocument",
    ],
    [untagged, "untaggedImage"],
    [
      { kind: "blocked", blocker: "not-figure", documentTagged: true },
      "notFigure",
    ],
    [
      { kind: "blocked", blocker: "encrypted", documentTagged: true },
      "encrypted",
    ],
    [
      { kind: "blocked", blocker: "unreadable", documentTagged: true },
      "unreadable",
    ],
  ])("says why an image cannot be described: %o", (accessibility, message) => {
    renderSection(accessibility);
    expect(screen.queryByTestId(FIELD)).not.toBeInTheDocument();
    expect(
      screen.getByTestId("pdf-editor-image-accessibility-status"),
    ).toHaveTextContent(`${KEY}.${message}`);
  });

  describe("decorative", () => {
    it("marks a describable image decorative", () => {
      const { onSetDecorative } = renderSection(describable("Bar chart"));
      const box = screen.getByTestId(DECORATIVE);
      expect(box).not.toBeChecked();
      fireEvent.click(box);
      expect(onSetDecorative).toHaveBeenCalledWith(true);
    });

    it("unmarks a decorative image", () => {
      const { onSetDecorative } = renderSection({
        kind: "decorative",
        canUndecorate: true,
      });
      const box = screen.getByTestId(DECORATIVE);
      expect(box).toBeChecked();
      fireEvent.click(box);
      expect(onSetDecorative).toHaveBeenCalledWith(false);
    });

    it("cannot unmark a decorative image it cannot retag", () => {
      renderSection({ kind: "decorative", canUndecorate: false });
      expect(screen.getByTestId(DECORATIVE)).toBeChecked();
      expect(screen.getByTestId(DECORATIVE)).toBeDisabled();
      expect(screen.queryByTestId(FIELD)).not.toBeInTheDocument();
    });

    it("cannot mark a figure with other content, and says why", () => {
      renderSection(describable("Bar chart", false));
      expect(screen.getByTestId(DECORATIVE)).toBeDisabled();
      expect(screen.getByText(`${KEY}.mixedContent`)).toBeVisible();
    });

    it("is not offered for an image that cannot be described", () => {
      renderSection(untagged);
      expect(screen.queryByTestId(DECORATIVE)).not.toBeInTheDocument();
    });
  });

  it("moves on to the next image needing attention", () => {
    const { onNext } = renderSection(describable("Done"), {
      review: { needsDescription: 1, untagged: 1, untaggable: 0 },
    });
    fireEvent.click(screen.getByTestId(NEXT));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it.each<[string, ImageAccessibility, ImageReview, boolean]>([
    [
      "only this one needs a description",
      describable(null),
      { needsDescription: 1, untagged: 0, untaggable: 0 },
      false,
    ],
    [
      "another needs a description",
      describable(null),
      { needsDescription: 2, untagged: 0, untaggable: 0 },
      true,
    ],
    [
      "this one can't be tagged, nor can another",
      untagged,
      { needsDescription: 0, untagged: 0, untaggable: 2 },
      false,
    ],
    [
      "this one can't be tagged, and another is untagged",
      untagged,
      { needsDescription: 0, untagged: 1, untaggable: 1 },
      true,
    ],
    [
      "only this one is untagged, and can be tagged",
      taggable,
      { needsDescription: 0, untagged: 1, untaggable: 0 },
      false,
    ],
    [
      "another is untagged",
      describable("Done"),
      { needsDescription: 0, untagged: 1, untaggable: 0 },
      true,
    ],
    [
      "a decorative image, one elsewhere",
      { kind: "decorative", canUndecorate: false },
      { needsDescription: 1, untagged: 0, untaggable: 0 },
      true,
    ],
    [
      "nothing left",
      describable("Done"),
      { needsDescription: 0, untagged: 0, untaggable: 0 },
      false,
    ],
  ])(
    "offers Next only when another image needs attention: %s",
    (_, accessibility, review, offered) => {
      renderSection(accessibility, { review });
      expect(screen.queryByTestId(NEXT) !== null).toBe(offered);
    },
  );
});
