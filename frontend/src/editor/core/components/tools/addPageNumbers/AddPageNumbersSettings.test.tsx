import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AddPageNumbersSettings from "@editor/components/tools/addPageNumbers/AddPageNumbersSettings";
import {
  defaultParameters,
  type AddPageNumbersParameters,
} from "@editor/components/tools/addPageNumbers/useAddPageNumbersParameters";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback }),
  Trans: ({ defaults }: { defaults: string }) => defaults,
}));
vi.mock("@editor/components/tools/addPageNumbers/PageNumberPreview", () => ({
  default: () => null,
}));

const renderSettings = (parameters: AddPageNumbersParameters) => {
  const onParameterChange = vi.fn();
  render(
    <MantineProvider env="test">
      <AddPageNumbersSettings
        parameters={parameters}
        onParameterChange={onParameterChange}
      />
    </MantineProvider>,
  );
  return onParameterChange;
};

describe("Bates style", () => {
  it("switches to bottom-right with six digits", async () => {
    const onParameterChange = renderSettings(defaultParameters);

    await userEvent.click(screen.getByText("Bates"));

    expect(onParameterChange).toHaveBeenCalledWith("numberingStyle", "bates");
    expect(onParameterChange).toHaveBeenCalledWith("position", 9);
    expect(onParameterChange).toHaveBeenCalledWith("zeroPad", 6);
  });

  it("keeps digits the user already chose", async () => {
    const onParameterChange = renderSettings({
      ...defaultParameters,
      zeroPad: 8,
    });

    await userEvent.click(screen.getByText("Bates"));

    expect(onParameterChange).not.toHaveBeenCalledWith(
      "zeroPad",
      expect.anything(),
    );
  });

  it("asks for prefix, suffix and digits instead of custom text and pages", () => {
    renderSettings({ ...defaultParameters, numberingStyle: "bates" });

    expect(screen.getByRole("textbox", { name: "Prefix" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Suffix" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Digits" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Pages to Number" })).toBe(
      null,
    );
    expect(screen.queryByRole("textbox", { name: "Custom Text Format" })).toBe(
      null,
    );
  });
});
