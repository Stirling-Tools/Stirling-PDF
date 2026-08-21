import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import ButtonSelector from "@app/components/shared/ButtonSelector";

// Wrapper component to provide Mantine context
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

// The shared SegmentedControl renders each option as a radio <input> (inside a
// <label>) whose `value` attribute matches the option value. Select by value
// since it is stable regardless of how the label is wrapped (e.g. FitText).
const getRadioByValue = (container: HTMLElement, value: string) =>
  container.querySelector<HTMLInputElement>(
    `input[type="radio"][value="${value}"]`,
  );

describe("ButtonSelector", () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("should render all options as segments", () => {
    const options = [
      { value: "option1", label: "Option 1" },
      { value: "option2", label: "Option 2" },
    ];

    render(
      <TestWrapper>
        <ButtonSelector
          value="option1"
          onChange={mockOnChange}
          options={options}
          label="Test Label"
        />
      </TestWrapper>,
    );

    expect(screen.getByText("Test Label")).toBeInTheDocument();
    expect(screen.getByText("Option 1")).toBeInTheDocument();
    expect(screen.getByText("Option 2")).toBeInTheDocument();
  });

  test("should mark selected option as checked", () => {
    const options = [
      { value: "option1", label: "Option 1" },
      { value: "option2", label: "Option 2" },
    ];

    const { container } = render(
      <TestWrapper>
        <ButtonSelector
          value="option1"
          onChange={mockOnChange}
          options={options}
          label="Selection Label"
        />
      </TestWrapper>,
    );

    const selectedRadio = getRadioByValue(container, "option1");
    const unselectedRadio = getRadioByValue(container, "option2");

    // Selected option is marked via the radio's checked state.
    expect(selectedRadio).toBeChecked();
    expect(unselectedRadio).not.toBeChecked();
    expect(screen.getByText("Selection Label")).toBeInTheDocument();
  });

  test("should call onChange when an option is clicked", () => {
    const options = [
      { value: "option1", label: "Option 1" },
      { value: "option2", label: "Option 2" },
    ];

    const { container } = render(
      <TestWrapper>
        <ButtonSelector
          value="option1"
          onChange={mockOnChange}
          options={options}
        />
      </TestWrapper>,
    );

    fireEvent.click(getRadioByValue(container, "option2")!);

    expect(mockOnChange).toHaveBeenCalledWith("option2");
  });

  test("should handle undefined value (no selection)", () => {
    const options = [
      { value: "option1", label: "Option 1" },
      { value: "option2", label: "Option 2" },
    ];

    const { container } = render(
      <TestWrapper>
        <ButtonSelector
          value={undefined}
          onChange={mockOnChange}
          options={options}
        />
      </TestWrapper>,
    );

    // No option should be checked when no value is selected
    const radio1 = getRadioByValue(container, "option1");
    const radio2 = getRadioByValue(container, "option2");

    expect(radio1).not.toBeChecked();
    expect(radio2).not.toBeChecked();
  });

  test.each([
    {
      description: "disable options when disabled prop is true",
      options: [
        { value: "option1", label: "Option 1" },
        { value: "option2", label: "Option 2" },
      ],
      globalDisabled: true,
      expectedStates: [true, true],
    },
    {
      description: "disable individual options when option.disabled is true",
      options: [
        { value: "option1", label: "Option 1" },
        { value: "option2", label: "Option 2", disabled: true },
      ],
      globalDisabled: false,
      expectedStates: [false, true],
    },
  ])("should $description", ({ options, globalDisabled, expectedStates }) => {
    const { container } = render(
      <TestWrapper>
        <ButtonSelector
          value="option1"
          onChange={mockOnChange}
          options={options}
          disabled={globalDisabled}
        />
      </TestWrapper>,
    );

    options.forEach((option, index) => {
      const radio = getRadioByValue(container, String(option.value));
      expect(radio).toHaveProperty("disabled", expectedStates[index]);
    });
  });

  test("should not allow selecting a disabled option", () => {
    const options = [
      { value: "option1", label: "Option 1" },
      { value: "option2", label: "Option 2", disabled: true },
    ];

    const { container } = render(
      <TestWrapper>
        <ButtonSelector
          value="option1"
          onChange={mockOnChange}
          options={options}
        />
      </TestWrapper>,
    );

    // The disabled option's radio is disabled, so a real user cannot select it
    // and onChange will not fire from genuine interaction. (jsdom does not
    // replicate the browser's disabled-click blocking, so assert the disabled
    // state — that is what prevents selection for real users.)
    const disabledRadio = getRadioByValue(container, "option2");
    expect(disabledRadio).toBeDisabled();
    expect(mockOnChange).not.toHaveBeenCalled();
  });

  test("should render options when fullWidth is false", () => {
    const options = [
      { value: "option1", label: "Option 1" },
      { value: "option2", label: "Option 2" },
    ];

    render(
      <TestWrapper>
        <ButtonSelector
          value="option1"
          onChange={mockOnChange}
          options={options}
          fullWidth={false}
          label="Layout Label"
        />
      </TestWrapper>,
    );

    expect(screen.getByText("Option 1")).toBeInTheDocument();
    expect(screen.getByText("Layout Label")).toBeInTheDocument();
  });

  test("should not render label element when not provided", () => {
    const options = [
      { value: "option1", label: "Option 1" },
      { value: "option2", label: "Option 2" },
    ];

    const { container } = render(
      <TestWrapper>
        <ButtonSelector
          value="option1"
          onChange={mockOnChange}
          options={options}
        />
      </TestWrapper>,
    );

    // Should render the options
    expect(screen.getByText("Option 1")).toBeInTheDocument();
    expect(screen.getByText("Option 2")).toBeInTheDocument();

    // Stack should only contain the SegmentedControl, no label Text element
    const stackElement = container.querySelector(
      '[class*="mantine-Stack-root"]',
    );
    expect(stackElement?.children).toHaveLength(1); // Only the SegmentedControl, no label Text
  });
});
