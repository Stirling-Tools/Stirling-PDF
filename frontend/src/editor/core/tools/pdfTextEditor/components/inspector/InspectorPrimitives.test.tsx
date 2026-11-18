import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field } from "@editor/tools/pdfTextEditor/components/inspector/InspectorPrimitives";

const HINT = "Screen readers switch voice to this language.";

function renderField() {
  render(
    <MantineProvider env="test">
      <Field label="Language" hint={HINT}>
        <input />
      </Field>
    </MantineProvider>,
  );
  return screen.getByRole("button", { name: HINT });
}

describe("Field hint", () => {
  it("shows the hint when the pointer rests on its icon", async () => {
    fireEvent.pointerEnter(renderField());
    expect(await screen.findByRole("tooltip")).toHaveTextContent(HINT);
  });

  it("shows the hint when its icon takes keyboard focus", async () => {
    const icon = renderField();
    fireEvent.focus(icon);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(HINT);
  });
});
