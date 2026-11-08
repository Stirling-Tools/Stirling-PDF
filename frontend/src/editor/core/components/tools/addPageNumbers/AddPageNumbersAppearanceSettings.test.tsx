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

  test.each(["roman-lowercase", "alpha-uppercase"] as const)(
    "zero-padding is disabled for %s page numbers",
    (numberFormat) => {
      render(
        <TestWrapper>
          <AddPageNumbersAppearanceSettings
            parameters={{ ...defaultParameters, numberFormat }}
            onParameterChange={vi.fn()}
          />
        </TestWrapper>,
      );

      expect(
        screen.getByLabelText("Zero-pad Width (Bates Stamping)"),
      ).toBeDisabled();
    },
  );

  test.each([
    ["roman-uppercase", "Roman uppercase (I, II, III)"],
    ["alpha-lowercase", "Alphabetic lowercase (a, b, c)"],
  ] as const)("shows the selected %s format", (numberFormat, label) => {
    render(
      <TestWrapper>
        <AddPageNumbersAppearanceSettings
          parameters={{ ...defaultParameters, numberFormat }}
          onParameterChange={vi.fn()}
        />
      </TestWrapper>,
    );

    expect(screen.getByDisplayValue(label)).toBeInTheDocument();
  });
});
