import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import RedactSingleStepSettings from "@editor/components/tools/redact/RedactSingleStepSettings";
import { defaultParameters } from "@editor/hooks/tools/redact/useRedactParameters";
import { presetPatterns } from "@editor/data/redactPresets";

// Mock useTranslation
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: vi.fn((_key: string, fallback: string) => fallback),
  }),
}));

// Wrapper component to provide Mantine context
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe("RedactSingleStepSettings", () => {
  const mockOnParameterChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders the automatic redaction settings with no mode choice", () => {
    render(
      <TestWrapper>
        <RedactSingleStepSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>,
    );

    expect(screen.getByText("Words to Redact")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter a word")).toBeInTheDocument();
    expect(screen.getByText("Box Colour")).toBeInTheDocument();
    expect(screen.getByText("Use Regex")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  test("should pass through parameter changes from automatic settings", () => {
    render(
      <TestWrapper>
        <RedactSingleStepSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>,
    );

    // Test adding a word
    const input = screen.getByPlaceholderText("Enter a word");
    const addButton = screen.getByRole("button", { name: "+ Add" });

    fireEvent.change(input, { target: { value: "TestWord" } });
    fireEvent.click(addButton);

    expect(mockOnParameterChange).toHaveBeenCalledWith("wordsToRedact", [
      "TestWord",
    ]);
  });

  test("opens saved presets in the picker, not the words list", () => {
    const [email] = presetPatterns(["email"]);
    render(
      <TestWrapper>
        <RedactSingleStepSettings
          parameters={{
            ...defaultParameters,
            useRegex: true,
            wordsToRedact: [email, "Confidential"],
          }}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>,
    );

    expect(screen.getByLabelText("Email addresses")).toBeChecked();
    expect(screen.getByLabelText("Phone numbers")).not.toBeChecked();
    expect(screen.getByText("Confidential")).toBeInTheDocument();
    expect(screen.queryByText(email)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Use Regex")).toBeDisabled();
  });

  test("escapes a word added while a preset is selected", () => {
    const [email] = presetPatterns(["email"]);
    render(
      <TestWrapper>
        <RedactSingleStepSettings
          parameters={{
            ...defaultParameters,
            useRegex: true,
            wordsToRedact: [email],
          }}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>,
    );

    fireEvent.change(screen.getByPlaceholderText("Enter a word"), {
      target: { value: "J. Smith (Jr.)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "+ Add" }));

    expect(mockOnParameterChange).toHaveBeenCalledWith("wordsToRedact", [
      email,
      "J\\. Smith \\(Jr\\.\\)",
    ]);
  });

  test("should pass through parameter changes from advanced settings", () => {
    render(
      <TestWrapper>
        <RedactSingleStepSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>,
    );

    // Test changing color
    const colorInput = screen.getByDisplayValue("#000000");
    fireEvent.change(colorInput, { target: { value: "#FF0000" } });

    expect(mockOnParameterChange).toHaveBeenCalledWith(
      "redactColor",
      "#FF0000",
    );
  });

  test("should disable all controls when disabled prop is true", () => {
    render(
      <TestWrapper>
        <RedactSingleStepSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
          disabled={true}
        />
      </TestWrapper>,
    );

    expect(screen.getByPlaceholderText("Enter a word")).toBeDisabled();
    expect(screen.getByRole("button", { name: "+ Add" })).toBeDisabled();
    expect(screen.getByDisplayValue("#000000")).toBeDisabled();
  });

  test("should show current parameter values in automatic mode", () => {
    const customParameters = {
      ...defaultParameters,
      wordsToRedact: ["Word1", "Word2"],
      redactColor: "#FF0000",
      useRegex: true,
      customPadding: 0.5,
    };

    render(
      <TestWrapper>
        <RedactSingleStepSettings
          parameters={customParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>,
    );

    // Check that word tags are displayed
    expect(screen.getByText("Word1")).toBeInTheDocument();
    expect(screen.getByText("Word2")).toBeInTheDocument();

    // Check that color is displayed
    expect(screen.getByDisplayValue("#FF0000")).toBeInTheDocument();

    // Check that regex checkbox is checked
    const useRegexCheckbox = screen.getByLabelText("Use Regex");
    expect(useRegexCheckbox).toBeChecked();

    // Check that padding value is displayed
    expect(screen.getByDisplayValue("0.5")).toBeInTheDocument();
  });

  test("should maintain consistent spacing and layout", () => {
    render(
      <TestWrapper>
        <RedactSingleStepSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>,
    );

    // Check that the Stack container exists
    const container = screen
      .getByText("Words to Redact")
      .closest(".mantine-Stack-root");
    expect(container).toBeInTheDocument();
  });
});
