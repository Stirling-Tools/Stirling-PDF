import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    await userEvent.setup().hover(renderField());
    expect(await screen.findByRole("dialog")).toHaveTextContent(HINT);
  });

  it("shows the hint when its icon takes keyboard focus", async () => {
    const icon = renderField();
    await userEvent.setup().tab();
    expect(icon).toHaveFocus();
    expect(await screen.findByRole("dialog")).toHaveTextContent(HINT);
  });
});
