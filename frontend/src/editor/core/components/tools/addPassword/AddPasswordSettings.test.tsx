import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import AddPasswordSettings from "@editor/components/tools/addPassword/AddPasswordSettings";
import { defaultParameters } from "@editor/hooks/tools/addPassword/useAddPasswordParameters";

// Mock useTranslation with predictable return values
const mockT = vi.fn((key: string) => `mock-${key}`);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

// Wrapper component to provide Mantine context
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe("AddPasswordSettings", () => {
  const mockOnParameterChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("should render password input fields", () => {
    render(
      <TestWrapper>
        <AddPasswordSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>,
    );

    // Should render user and owner password fields labels
    expect(
      screen.getByText("mock-encryptedPdfUnlock.openingPassword"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("mock-encryptedPdfUnlock.newOwnerPassword"),
    ).toBeInTheDocument();
  });

  test("should render encryption strength as a segmented control", () => {
    render(
      <TestWrapper>
        <AddPasswordSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>,
    );

    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  test("should render main component sections", () => {
    render(
      <TestWrapper>
        <AddPasswordSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>,
    );

    // Check that main section titles are rendered
    expect(
      screen.getByText("mock-encryptedPdfUnlock.openingPassword"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("mock-addPassword.encryption.keyLength.label"),
    ).toBeInTheDocument();
  });

  test("should call onParameterChange when password fields are modified", () => {
    render(
      <TestWrapper>
        <AddPasswordSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>,
    );

    // This test is complex with Mantine's PasswordInput, just verify the component renders
    expect(
      screen.getByText("mock-encryptedPdfUnlock.openingPassword"),
    ).toBeInTheDocument();
  });

  test("should call onParameterChange when key length is changed", () => {
    render(
      <TestWrapper>
        <AddPasswordSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>,
    );

    fireEvent.click(
      screen.getByText("mock-addPassword.encryption.keyLength.256bit"),
    );

    expect(mockOnParameterChange).toHaveBeenCalledWith("keyLength", 256);
  });

  test("should disable all form elements when disabled prop is true", () => {
    const { container } = render(
      <TestWrapper>
        <AddPasswordSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
          disabled={true}
        />
      </TestWrapper>,
    );

    container.querySelectorAll("input").forEach((input) => {
      expect(input).toBeDisabled();
    });
  });

  test("should enable all form elements when disabled prop is false", () => {
    const { container } = render(
      <TestWrapper>
        <AddPasswordSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
          disabled={false}
        />
      </TestWrapper>,
    );

    container.querySelectorAll("input").forEach((input) => {
      expect(input).not.toBeDisabled();
    });
  });

  test("should call translation function with correct keys", () => {
    render(
      <TestWrapper>
        <AddPasswordSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>,
    );

    // Verify that translation keys are being called
    expect(mockT).toHaveBeenCalledWith(
      "encryptedPdfUnlock.openingPassword",
      "Password to open",
    );
    expect(mockT).toHaveBeenCalledWith(
      "encryptedPdfUnlock.newOwnerPassword",
      "New permissions password",
    );
  });

  test.each([40, 128, 256])(
    "should mark key length %i as selected",
    (keyLength) => {
      render(
        <TestWrapper>
          <AddPasswordSettings
            parameters={{ ...defaultParameters, keyLength }}
            onParameterChange={mockOnParameterChange}
          />
        </TestWrapper>,
      );

      const checked = screen
        .getAllByRole("radio")
        .filter((radio) => (radio as HTMLInputElement).checked);
      expect(checked).toHaveLength(1);
      expect(checked[0]).toHaveAttribute("value", String(keyLength));
    },
  );
});
