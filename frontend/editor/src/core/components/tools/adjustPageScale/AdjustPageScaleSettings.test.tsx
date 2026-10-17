import { describe, expect, test, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import AdjustPageScaleSettings from "@app/components/tools/adjustPageScale/AdjustPageScaleSettings";
import {
  AdjustPageScaleParameters,
  PageSize,
  defaultParameters as hookDefaultParameters,
} from "@app/hooks/tools/adjustPageScale/useAdjustPageScaleParameters";

// Mock useTranslation with predictable return values
const mockT = vi.fn(
  (key: string, fallback?: string) => fallback || `mock-${key}`,
);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

// Wrapper component to provide Mantine context
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe("AdjustPageScaleSettings", () => {
  const defaultParameters: AdjustPageScaleParameters = {
    ...hookDefaultParameters,
    scaleFactor: 1.0,
    pageSize: PageSize.KEEP,
    orientation: "PORTRAIT",
  };

  const mockOnParameterChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("should render without crashing", () => {
    render(
      <TestWrapper>
        <AdjustPageScaleSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>,
    );

    // Basic render test - component renders without throwing
    expect(screen.getByText("Scale Factor")).toBeInTheDocument();
    expect(screen.getByText("Target Page Size")).toBeInTheDocument();
  });

  test("should render with custom parameters", () => {
    const customParameters: AdjustPageScaleParameters = {
      ...hookDefaultParameters,
      scaleFactor: 2.5,
      pageSize: PageSize.A4,
      orientation: "LANDSCAPE",
    };

    render(
      <TestWrapper>
        <AdjustPageScaleSettings
          parameters={customParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>,
    );

    // Component renders successfully with custom parameters
    expect(screen.getByText("Scale Factor")).toBeInTheDocument();
    expect(screen.getByText("Target Page Size")).toBeInTheDocument();
    expect(screen.queryByText("Width")).not.toBeInTheDocument();
  });

  test("shows width, height and unit inputs for a custom page size", () => {
    render(
      <TestWrapper>
        <AdjustPageScaleSettings
          parameters={{ ...defaultParameters, pageSize: PageSize.CUSTOM }}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>,
    );

    expect(screen.getByText("Width")).toBeInTheDocument();
    expect(screen.getByText("Height")).toBeInTheDocument();
    expect(
      screen.getByRole("radiogroup", { name: "Unit" }),
    ).toBeInTheDocument();
  });

  test("converts the width and height when the unit changes", () => {
    render(
      <TestWrapper>
        <AdjustPageScaleSettings
          parameters={{
            ...defaultParameters,
            pageSize: PageSize.CUSTOM,
            customWidth: 210,
            customHeight: 297,
            customUnit: "mm",
          }}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>,
    );

    fireEvent.click(screen.getByRole("radio", { name: "in" }));

    expect(mockOnParameterChange).toHaveBeenCalledWith("customWidth", 8.27);
    expect(mockOnParameterChange).toHaveBeenCalledWith("customHeight", 11.69);
    expect(mockOnParameterChange).toHaveBeenCalledWith("customUnit", "in");
  });
});
