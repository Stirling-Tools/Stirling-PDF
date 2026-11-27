import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  Field,
  PointsInput,
  lengthUnitFor,
} from "@editor/tools/pdfTextEditor/components/inspector/InspectorPrimitives";

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

describe("lengths", () => {
  it("uses inches where letter paper is the norm and mm elsewhere", () => {
    expect(lengthUnitFor("en-US")).toBe("in");
    expect(lengthUnitFor("en-GB")).toBe("mm");
    expect(lengthUnitFor("de")).toBe("mm");
  });

  it("shows points as mm and commits a typed mm value as points", () => {
    const onCommit = vi.fn();
    render(
      <MantineProvider env="test">
        <PointsInput value={72} unit="mm" label="X" onCommit={onCommit} />
      </MantineProvider>,
    );
    const input = screen.getByLabelText("X") as HTMLInputElement;
    expect(input.value).toBe("25.4 mm");
    fireEvent.change(input, { target: { value: "50.8" } });
    expect(onCommit).toHaveBeenCalledWith(expect.closeTo(144, 3));
  });
});
