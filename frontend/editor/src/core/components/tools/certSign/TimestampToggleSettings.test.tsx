import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import TimestampToggleSettings from "@app/components/tools/certSign/TimestampToggleSettings";
import { CertSignParameters } from "@app/hooks/tools/certSign/useCertSignParameters";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

const baseParameters: CertSignParameters = {
  signMode: "MANUAL",
  certType: "PFX",
  password: "",
  showSignature: false,
  reason: "",
  location: "",
  name: "",
  pageNumber: 1,
  showLogo: true,
  addTimestamp: true,
};

describe("TimestampToggleSettings", () => {
  const mockOnParameterChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders a single checkbox, checked when addTimestamp is true (the default)", () => {
    render(
      <TestWrapper>
        <TimestampToggleSettings
          parameters={baseParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>,
    );

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
  });

  test("renders unchecked when addTimestamp is false", () => {
    render(
      <TestWrapper>
        <TimestampToggleSettings
          parameters={{ ...baseParameters, addTimestamp: false }}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>,
    );

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
  });

  test("clicking the checkbox reports the toggled value to onParameterChange", () => {
    render(
      <TestWrapper>
        <TimestampToggleSettings
          parameters={baseParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>,
    );

    const checkbox = screen.getByRole("checkbox");
    checkbox.click();

    expect(mockOnParameterChange).toHaveBeenCalledWith("addTimestamp", false);
  });

  test("is disabled when the disabled prop is set", () => {
    render(
      <TestWrapper>
        <TimestampToggleSettings
          parameters={baseParameters}
          onParameterChange={mockOnParameterChange}
          disabled
        />
      </TestWrapper>,
    );

    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});
