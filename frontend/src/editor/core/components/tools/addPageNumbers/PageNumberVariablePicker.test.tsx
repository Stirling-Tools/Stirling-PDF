import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AddPageNumbersSettings from "@editor/components/tools/addPageNumbers/AddPageNumbersSettings";
import { defaultParameters } from "@editor/components/tools/addPageNumbers/useAddPageNumbersParameters";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback }),
  Trans: ({ defaults }: { defaults: string }) => defaults,
}));
vi.mock("@editor/components/tools/addPageNumbers/PageNumberPreview", () => ({
  default: () => null,
}));

const renderSettings = (customText: string) => {
  const onParameterChange = vi.fn();
  render(
    <MantineProvider env="test">
      <AddPageNumbersSettings
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
    const onParameterChange = renderSettings("Exhibit ");
    await userEvent.click(screen.getByRole("button", { name: "Variables" }));
    await userEvent.click(screen.getByRole("button", { name: "{n}" }));

    expect(onParameterChange).toHaveBeenCalledWith("customText", "Exhibit {n}");
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
