import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TextAccessibilitySection } from "@editor/tools/pdfTextEditor/components/inspector/TextAccessibilitySection";
import { structureRole } from "@editor/tools/pdfTextEditor/model/structureTypes";
import type { TextTag } from "@editor/tools/pdfTextEditor/util/textAccessibility";

const KEY = "pdfTextEditor.inspector.accessibility";

function tagShown(tag: TextTag): HTMLElement {
  render(
    <MantineProvider env="test">
      <TextAccessibilitySection tag={tag} onRetag={vi.fn()} />
    </MantineProvider>,
  );
  return screen.getByTestId("pdf-editor-text-tag");
}

const tagged = (role: string): TextTag => ({
  kind: "tagged",
  block: structureRole(role),
  cannotRetag: "not-text",
});

describe("TextAccessibilitySection", () => {
  it("names a type by its name alone", () => {
    expect(tagShown(tagged("H2"))).toHaveTextContent(
      new RegExp(`^${KEY}.tagName.headingLevel$`),
    );
  });

  it("shows a type with no plain-language name as the type", () => {
    expect(tagShown(tagged("Warichu"))).toHaveTextContent(/^Warichu$/);
  });

  it("marks a custom role as custom", () => {
    expect(tagShown(tagged("Callout"))).toHaveTextContent(`${KEY}.customTag`);
  });

  it.each([
    [{ kind: "artifact" } as const, "artifactText"],
    [{ kind: "untagged", documentTagged: true } as const, "untaggedBadge"],
    [{ kind: "untagged", documentTagged: false } as const, "untaggedDocument"],
    [{ kind: "unknown" } as const, "unknownTag"],
  ])("explains text with no element (%o)", (tag, message) => {
    expect(tagShown(tag)).toHaveTextContent(`${KEY}.${message}`);
  });

  it("offers a picker where the text's block can be retagged", () => {
    const onRetag = vi.fn();
    render(
      <MantineProvider env="test">
        <TextAccessibilitySection
          tag={{ kind: "tagged", block: structureRole("P"), cannotRetag: null }}
          onRetag={onRetag}
        />
      </MantineProvider>,
    );
    const input = screen.getByRole("textbox", { name: `${KEY}.tagLabel` });
    expect(input).toHaveValue(`${KEY}.tagName.paragraph`);
    fireEvent.click(input);
    fireEvent.click(screen.getByText(`${KEY}.tagName.code`));
    expect(onRetag).toHaveBeenCalledWith("Code");
  });

  it("shows a tag the picker does not offer in its place", () => {
    render(
      <MantineProvider env="test">
        <TextAccessibilitySection
          tag={{
            kind: "tagged",
            block: structureRole("Callout"),
            cannotRetag: null,
          }}
          onRetag={vi.fn()}
        />
      </MantineProvider>,
    );
    expect(
      screen.getByRole("textbox", { name: `${KEY}.tagLabel` }),
    ).toHaveAttribute("placeholder", `${KEY}.customTag`);
  });
});
