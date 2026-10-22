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
  onSetDescription = vi.fn(),
  { review = { needsDescription: 0, untagged: 0 }, onNext = vi.fn() } = {},
) {
  render(
    <MantineProvider env="test">
      <ImageAccessibilitySection
        accessibility={accessibility}
        onSetDescription={onSetDescription}
        review={review}
        onNext={onNext}
      />
    </MantineProvider>,
  );
  return onSetDescription;
}

const NEXT = "pdf-editor-image-description-next";

const KEY = "pdfTextEditor.inspector.accessibility";

describe("ImageAccessibilitySection", () => {
  it("edits the description and says it will be read out", () => {
    const onSetDescription = renderSection({
      kind: "describable",
      pageIndex: 0,
      mcid: 2,
      description: "Bar chart",
    });
    const field = screen.getByTestId("pdf-editor-image-description");
    expect(field).toHaveValue("Bar chart");
    expect(screen.getByText(`${KEY}.described`)).toBeVisible();
    fireEvent.change(field, { target: { value: "Bar chart of revenue" } });
    expect(onSetDescription).toHaveBeenCalledWith("Bar chart of revenue");
  });

  it("asks for a description when the image has none", () => {
    renderSection({
      kind: "describable",
      pageIndex: 0,
      mcid: 2,
      description: null,
    });
    expect(screen.getByTestId("pdf-editor-image-description")).toHaveValue("");
    expect(screen.getByText(`${KEY}.needsDescription`)).toBeVisible();
  });

  it.each<[ImageAccessibility, string]>([
    [{ kind: "decorative" }, "decorative"],
    [
      { kind: "blocked", blocker: "untagged", documentTagged: false },
      "untaggedDocument",
    ],
    [
      { kind: "blocked", blocker: "untagged", documentTagged: true },
      "untaggedImage",
    ],
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
  ])("explains why there is no field: %o", (accessibility, message) => {
    renderSection(accessibility);
    expect(
      screen.queryByTestId("pdf-editor-image-description"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("pdf-editor-image-accessibility-status"),
    ).toHaveTextContent(`${KEY}.${message}`);
  });

  it("moves on to the next image needing attention", () => {
    const onNext = vi.fn();
    renderSection(
      { kind: "describable", pageIndex: 0, mcid: 2, description: "Done" },
      vi.fn(),
      { review: { needsDescription: 1, untagged: 1 }, onNext },
    );
    fireEvent.click(screen.getByTestId(NEXT));
    expect(onNext).toHaveBeenCalledOnce();
  });

  const describable = (description: string | null): ImageAccessibility => ({
    kind: "describable",
    pageIndex: 0,
    mcid: 2,
    description,
  });
  const untagged: ImageAccessibility = {
    kind: "blocked",
    blocker: "untagged",
    documentTagged: true,
  };

  it.each<[string, ImageAccessibility, ImageReview, boolean]>([
    [
      "only this one needs a description",
      describable(null),
      { needsDescription: 1, untagged: 0 },
      false,
    ],
    [
      "another needs a description",
      describable(null),
      { needsDescription: 2, untagged: 0 },
      true,
    ],
    [
      "only this one is untagged",
      untagged,
      { needsDescription: 0, untagged: 1 },
      false,
    ],
    [
      "another is untagged",
      describable("Done"),
      { needsDescription: 0, untagged: 1 },
      true,
    ],
    [
      "a decorative image, one elsewhere",
      { kind: "decorative" },
      { needsDescription: 1, untagged: 0 },
      true,
    ],
    [
      "nothing left",
      describable("Done"),
      { needsDescription: 0, untagged: 0 },
      false,
    ],
  ])(
    "offers Next only when another image needs attention: %s",
    (_, accessibility, review, offered) => {
      renderSection(accessibility, vi.fn(), { review });
      expect(screen.queryByTestId(NEXT) !== null).toBe(offered);
    },
  );
});
