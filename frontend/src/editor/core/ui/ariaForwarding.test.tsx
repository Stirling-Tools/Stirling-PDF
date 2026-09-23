import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { Select } from "@app/ui/Select";
import { MultiSelect } from "@app/ui/MultiSelect";
import { NumberInput } from "@app/ui/NumberInput";
import { ColorInput } from "@app/ui/ColorInput";
import { Slider } from "@app/ui/Slider";

// Guards the FormField contract on the Mantine-backed components: the
// injected required / aria-describedby / aria-invalid wiring must reach the
// focusable element. Mantine internals clobber some of these (see
// ariaForwarding.ts), so this exercises the real DOM output.

function renderInProvider(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

const OPTIONS = [{ value: "a", label: "A" }];

describe("Mantine-backed SUI aria forwarding", () => {
  it("Select forwards required and aria-describedby to the input", () => {
    const { container } = renderInProvider(
      <Select
        options={OPTIONS}
        value="a"
        onChange={() => {}}
        required
        aria-describedby="help-1"
      />,
    );
    const input = container.querySelector("input");
    expect(input?.hasAttribute("required")).toBe(true);
    expect(input?.getAttribute("aria-describedby")).toBe("help-1");
  });

  it("Select sets aria-invalid from the invalid flag", () => {
    const { container } = renderInProvider(
      <Select options={OPTIONS} value="a" onChange={() => {}} invalid />,
    );
    expect(container.querySelector("input")?.getAttribute("aria-invalid")).toBe(
      "true",
    );
  });

  it("MultiSelect forwards aria-required and aria-describedby to the field", () => {
    const { container } = renderInProvider(
      <MultiSelect
        data={OPTIONS}
        value={["a"]}
        onChange={() => {}}
        required
        aria-describedby="help-2"
      />,
    );
    // The focusable pills field; a native `required` would misfire form
    // validation there, so the requirement is announced via aria-required.
    const input = container.querySelector("input");
    expect(input?.getAttribute("aria-required")).toBe("true");
    expect(input?.getAttribute("aria-describedby")).toBe("help-2");
  });

  it("NumberInput forwards required and aria-describedby to the input", () => {
    const { container } = renderInProvider(
      <NumberInput
        value={1}
        onChange={() => {}}
        required
        aria-describedby="help-3"
      />,
    );
    const input = container.querySelector("input");
    expect(input?.hasAttribute("required")).toBe(true);
    expect(input?.getAttribute("aria-describedby")).toBe("help-3");
  });

  it("ColorInput forwards required and aria-describedby to the input", () => {
    const { container } = renderInProvider(
      <ColorInput
        value="#000000"
        onChange={() => {}}
        required
        aria-describedby="help-4"
      />,
    );
    const input = container.querySelector("input");
    expect(input?.hasAttribute("required")).toBe(true);
    expect(input?.getAttribute("aria-describedby")).toBe("help-4");
  });

  it("Slider forwards aria wiring to the role=slider thumb", () => {
    const { container } = renderInProvider(
      <Slider
        value={0.5}
        onChange={() => {}}
        aria-label="Confidence"
        aria-invalid
        aria-describedby="help-5"
      />,
    );
    const thumb = container.querySelector('[role="slider"]');
    expect(thumb?.getAttribute("aria-label")).toBe("Confidence");
    expect(thumb?.getAttribute("aria-invalid")).toBe("true");
    expect(thumb?.getAttribute("aria-describedby")).toBe("help-5");
  });
});
