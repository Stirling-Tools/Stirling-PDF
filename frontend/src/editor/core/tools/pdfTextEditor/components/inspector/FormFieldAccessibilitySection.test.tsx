import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FormFieldAccessibilitySection } from "@editor/tools/pdfTextEditor/components/inspector/FormFieldAccessibilitySection";
import type { FormFieldAccessibility } from "@editor/tools/pdfTextEditor/util/formFieldAccessibility";

const KEY = "pdfTextEditor.inspector.accessibility";
const WIDGET = {
  annotation: 20,
  position: 0,
  rect: { x: 110, y: 694, width: 190, height: 20 },
  fieldType: "Tx",
  tooltip: null,
  holder: null,
};

function editable(
  tagged: boolean,
  description: string | null = null,
): FormFieldAccessibility {
  return { kind: "editable", widget: WIDGET, tagged, description };
}

function renderSection(accessibility: FormFieldAccessibility) {
  const onTag = vi.fn();
  const onSetDescription = vi.fn();
  render(
    <MantineProvider env="test">
      <FormFieldAccessibilitySection
        accessibility={accessibility}
        onTag={onTag}
        onSetDescription={onSetDescription}
      />
    </MantineProvider>,
  );
  return { onTag, onSetDescription };
}

describe("FormFieldAccessibilitySection", () => {
  it("offers tagging an untagged field", () => {
    const { onTag } = renderSection(editable(false));
    expect(screen.getByTestId("pdf-editor-form-field-tag")).toHaveTextContent(
      `${KEY}.untaggedBadge`,
    );
    fireEvent.click(screen.getByTestId("pdf-editor-tag-form-field"));
    expect(onTag).toHaveBeenCalled();
  });

  it("offers no tagging for a tagged field", () => {
    renderSection(editable(true));
    expect(screen.getByTestId("pdf-editor-form-field-tag")).toHaveTextContent(
      `${KEY}.tagName.form`,
    );
    expect(screen.queryByTestId("pdf-editor-tag-form-field")).toBeNull();
  });

  it("edits the field's description", () => {
    const { onSetDescription } = renderSection(editable(true, "Name"));
    const field = screen.getByTestId("pdf-editor-form-field-description");
    expect(field).toHaveValue("Name");
    fireEvent.change(field, { target: { value: "Full name" } });
    expect(onSetDescription).toHaveBeenCalledWith("Full name");
  });

  it("says why a field can't be changed, and offers nothing", () => {
    renderSection({ kind: "blocked", blocker: "unknown" });
    expect(
      screen.getByTestId("pdf-editor-form-field-accessibility-status"),
    ).toHaveTextContent(`${KEY}.cannotTagFormField`);
    expect(screen.queryByTestId("pdf-editor-tag-form-field")).toBeNull();
    expect(
      screen.queryByTestId("pdf-editor-form-field-description"),
    ).toBeNull();
  });
});
