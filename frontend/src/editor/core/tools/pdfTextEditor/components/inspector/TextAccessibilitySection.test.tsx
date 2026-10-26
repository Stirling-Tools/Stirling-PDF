import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextAccessibilitySection } from "@editor/tools/pdfTextEditor/components/inspector/TextAccessibilitySection";
import { structureRole } from "@editor/tools/pdfTextEditor/model/structureTypes";
import type { TextTag } from "@editor/tools/pdfTextEditor/util/textAccessibility";

const KEY = "pdfTextEditor.inspector.accessibility";

function tagShown(tag: TextTag): HTMLElement {
  render(
    <MantineProvider env="test">
      <TextAccessibilitySection tag={tag} />
    </MantineProvider>,
  );
  return screen.getByTestId("pdf-editor-text-tag");
}

const tagged = (role: string): TextTag => ({
  kind: "tagged",
  block: structureRole(role),
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
});
