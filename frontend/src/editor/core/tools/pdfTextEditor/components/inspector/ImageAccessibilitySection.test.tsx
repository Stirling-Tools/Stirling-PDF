import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImageAccessibilitySection } from "@editor/tools/pdfTextEditor/components/inspector/ImageAccessibilitySection";
import type { ImageAccessibility } from "@editor/tools/pdfTextEditor/util/imageAccessibility";

function renderSection(
  accessibility: ImageAccessibility,
  onSetDescription = vi.fn(),
) {
  render(
    <MantineProvider env="test">
      <ImageAccessibilitySection
        accessibility={accessibility}
        onSetDescription={onSetDescription}
      />
    </MantineProvider>,
  );
  return onSetDescription;
}

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
});
