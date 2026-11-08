import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import AddPageNumbersAppearanceSettings from "@editor/components/tools/addPageNumbers/AddPageNumbersAppearanceSettings";
import { defaultParameters } from "@editor/components/tools/addPageNumbers/useAddPageNumbersParameters";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe("AddPageNumbersAppearanceSettings", () => {
  test("zero-padding stays enabled for numeric page numbers", () => {
    render(
      <TestWrapper>
        <AddPageNumbersAppearanceSettings
          parameters={defaultParameters}
          onParameterChange={vi.fn()}
        />
      </TestWrapper>,
    );

    expect(
      screen.getByLabelText("Zero-pad Width (Bates Stamping)"),
    ).toBeEnabled();
  });

  test("zero-padding is disabled for Roman page numbers", () => {
    render(
      <TestWrapper>
        <AddPageNumbersAppearanceSettings
          parameters={{
            ...defaultParameters,
            numberFormat: "roman-lowercase",
          }}
          onParameterChange={vi.fn()}
        />
      </TestWrapper>,
    );

    expect(
      screen.getByLabelText("Zero-pad Width (Bates Stamping)"),
    ).toBeDisabled();
  });

  test("shows the selected Roman format", () => {
    render(
      <TestWrapper>
        <AddPageNumbersAppearanceSettings
          parameters={{
            ...defaultParameters,
            numberFormat: "roman-uppercase",
          }}
          onParameterChange={vi.fn()}
        />
      </TestWrapper>,
    );

    expect(
      screen.getByDisplayValue("Roman uppercase (I, II, III)"),
    ).toBeInTheDocument();
  });
});
