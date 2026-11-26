import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AddPageNumbersAppearanceSettings from "@editor/components/tools/addPageNumbers/AddPageNumbersAppearanceSettings";
import { defaultParameters } from "@editor/components/tools/addPageNumbers/useAddPageNumbersParameters";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback }),
  Trans: ({ defaults }: { defaults: string }) => defaults,
}));

const renderSettings = (customText: string) => {
  const onParameterChange = vi.fn();
  render(
    <MantineProvider env="test">
      <AddPageNumbersAppearanceSettings
        parameters={{ ...defaultParameters, customText }}
        onParameterChange={onParameterChange}
      />
    </MantineProvider>,
  );
  return onParameterChange;
};

describe("custom text variables", () => {
  it("lists every variable the backend accepts", async () => {
    renderSettings("");
    await userEvent.click(screen.getByRole("button", { name: "Variables" }));

    for (const token of ["{n}", "{total}", "{filename}"]) {
      expect(screen.getByRole("button", { name: token })).toBeTruthy();
    }
  });

  it("adds a variable at the end before the field has had a caret", async () => {
    const onParameterChange = renderSettings("REF-2026-0412-");
    await userEvent.click(screen.getByRole("button", { name: "Variables" }));
    await userEvent.click(screen.getByRole("button", { name: "{n}" }));

    expect(onParameterChange).toHaveBeenCalledWith(
      "customText",
      "REF-2026-0412-{n}",
    );
  });

  it("adds a variable at the caret", async () => {
    const onParameterChange = renderSettings("Page  of {total}");
    const input = screen.getByRole("textbox", { name: "Custom Text Format" });
    (input as HTMLInputElement).setSelectionRange(5, 5);
    fireEvent.select(input);

    await userEvent.click(screen.getByRole("button", { name: "Variables" }));
    await userEvent.click(screen.getByRole("button", { name: "{n}" }));

    expect(onParameterChange).toHaveBeenCalledWith(
      "customText",
      "Page {n} of {total}",
    );
  });
});
