import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TextAccessibilitySection } from "@editor/tools/pdfTextEditor/components/inspector/TextAccessibilitySection";
import { structureRole } from "@editor/tools/pdfTextEditor/model/structureTypes";
import type { InnerTagsControl } from "@editor/tools/pdfTextEditor/hooks/useTextAccessibility";
import type { TextTag } from "@editor/tools/pdfTextEditor/util/textAccessibility";

const KEY = "pdfTextEditor.inspector.accessibility";
const NO_INNER: InnerTagsControl = {
  tags: [],
  active: null,
  onSelect: () => {},
  onSet: () => {},
  newTagTypes: null,
  onTagSelection: () => {},
};

function tagShown(tag: TextTag): HTMLElement {
  render(
    <MantineProvider env="test">
      <TextAccessibilitySection tag={tag} onSetTag={vi.fn()} inner={NO_INNER} />
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
    [
      { kind: "untagged", documentTagged: true, taggable: false } as const,
      "untaggedBadge",
    ],
    [
      { kind: "untagged", documentTagged: false, taggable: false } as const,
      "untaggedDocument",
    ],
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
          onSetTag={onRetag}
          inner={NO_INNER}
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
          onSetTag={vi.fn()}
          inner={NO_INNER}
        />
      </MantineProvider>,
    );
    expect(
      screen.getByRole("textbox", { name: `${KEY}.tagLabel` }),
    ).toHaveAttribute("placeholder", `${KEY}.customTag`);
  });

  it("numbers the tags inside the text and selects one when clicked", () => {
    const inner = innerControl();
    renderSection(inner);
    const rows = screen.getAllByTestId("pdf-editor-inner-tag");
    expect(rows.map((row) => row.textContent)).toEqual([
      "1Umsatzerlöse",
      "2the appendix",
    ]);
    fireEvent.click(within(rows[1]).getByRole("button"));
    expect(inner.onSelect).toHaveBeenCalledWith(1);
    expect(screen.queryByTestId("pdf-editor-inner-tag-picker")).toBeNull();
  });

  it("changes or removes the selected tag", () => {
    const inner = innerControl({ active: 0 });
    renderSection(inner);
    const input = screen.getByRole("textbox", {
      name: `${KEY}.innerTagLabel`,
    });
    expect(input).toHaveValue(`${KEY}.tagName.span`);
    fireEvent.click(input);
    fireEvent.click(within(listboxOf(input)).getByText(`${KEY}.tagName.code`));
    expect(inner.onSet).toHaveBeenCalledWith(0, "Code");
    fireEvent.click(screen.getByTestId("pdf-editor-inner-tag-remove"));
    expect(inner.onSet).toHaveBeenCalledWith(0, null);
  });

  it("offers no change to a tag that cannot take one", () => {
    renderSection(innerControl({ active: 1 }));
    expect(
      screen.getByRole("textbox", { name: `${KEY}.innerTagLabel` }),
    ).toBeDisabled();
    expect(screen.queryByTestId("pdf-editor-inner-tag-remove")).toBeNull();
  });

  it("tags characters selected inside the text", () => {
    const inner = innerControl({ newTagTypes: ["Span", "Code"] });
    renderSection(inner);
    const input = screen.getByRole("textbox", { name: `${KEY}.selectedText` });
    fireEvent.click(input);
    fireEvent.click(within(listboxOf(input)).getByText(`${KEY}.tagName.code`));
    expect(inner.onTagSelection).toHaveBeenCalledWith("Code");
  });

  it("disables adding a tag the selected characters cannot take", () => {
    renderSection(innerControl({ newTagTypes: [] }));
    expect(
      screen.getByRole("textbox", { name: `${KEY}.selectedText` }),
    ).toBeDisabled();
  });
});

function innerControl(
  overrides: Partial<InnerTagsControl> = {},
): InnerTagsControl {
  return {
    tags: [
      {
        key: "1",
        text: "Umsatzerlöse",
        start: 4,
        end: 9,
        role: structureRole("Span"),
        types: ["Span", "Code"],
        removable: true,
      },
      {
        key: "2",
        text: " the\nappendix ",
        start: 12,
        end: 20,
        role: structureRole("Link"),
        types: [],
        removable: false,
      },
    ],
    active: null,
    onSelect: vi.fn(),
    onSet: vi.fn(),
    newTagTypes: null,
    onTagSelection: vi.fn(),
    ...overrides,
  };
}

function renderSection(inner: InnerTagsControl) {
  render(
    <MantineProvider env="test">
      <TextAccessibilitySection
        tag={{ kind: "tagged", block: structureRole("P"), cannotRetag: null }}
        onSetTag={vi.fn()}
        inner={inner}
      />
    </MantineProvider>,
  );
}

/** The options of a picker: every picker's are in the document at once. */
function listboxOf(input: HTMLElement): HTMLElement {
  return document.getElementById(input.getAttribute("aria-controls")!)!;
}
