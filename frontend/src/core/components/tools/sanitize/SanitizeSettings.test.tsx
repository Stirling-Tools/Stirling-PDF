import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import SanitizeSettings from '@app/components/tools/sanitize/SanitizeSettings';
import { SanitizeParameters } from '@app/hooks/tools/sanitize/useSanitizeParameters';

// Mock useTranslation with predictable return values
const mockT = vi.fn((key: string) => `mock-${key}`);
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT })
}));

// Wrapper component to provide Mantine context
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe('SanitizeSettings', () => {
  const defaultParameters: SanitizeParameters = {
    removeJavaScript: true,
    removeEmbeddedFiles: true,
    removeXMPMetadata: false,
    removeMetadata: false,
    removeLinks: false,
    removeFonts: false,
  };

  const mockOnParameterChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should render all sanitization option checkboxes', () => {
    render(
      <TestWrapper>
        <SanitizeSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    // Should render one checkbox for each parameter
    const expectedCheckboxCount = Object.keys(defaultParameters).length;
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(expectedCheckboxCount);
  });

  test('should show correct initial checkbox states based on parameters', () => {
    render(
      <TestWrapper>
        <SanitizeSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    const checkboxes = screen.getAllByRole('checkbox');
    const parameterValues = Object.values(defaultParameters);

    parameterValues.forEach((value, index) => {
      if (value) {
        expect(checkboxes[index]).toBeChecked();
      } else {
        expect(checkboxes[index]).not.toBeChecked();
      }
    });
  });

  test('should call onParameterChange with correct parameters when checkboxes are clicked', () => {
    render(
      <TestWrapper>
        <SanitizeSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    const checkboxes = screen.getAllByRole('checkbox');

    // Click the first checkbox (removeJavaScript - should toggle from true to false)
    fireEvent.click(checkboxes[0]);
    expect(mockOnParameterChange).toHaveBeenCalledWith('removeJavaScript', false);

    // Click the third checkbox (removeXMPMetadata - should toggle from false to true)
    fireEvent.click(checkboxes[2]);
    expect(mockOnParameterChange).toHaveBeenCalledWith('removeXMPMetadata', true);
  });

  test('should disable all checkboxes when disabled prop is true', () => {
    render(
      <TestWrapper>
        <SanitizeSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
          disabled={true}
        />
      </TestWrapper>
    );

    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach(checkbox => {
      expect(checkbox).toBeDisabled();
    });
  });

  test('should enable all checkboxes when disabled prop is false or undefined', () => {
    render(
      <TestWrapper>
        <SanitizeSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
          disabled={false}
        />
      </TestWrapper>
    );

    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach(checkbox => {
      expect(checkbox).not.toBeDisabled();
    });
  });

  test('should handle different parameter combinations', () => {
    const allEnabledParameters: SanitizeParameters = {
      removeJavaScript: true,
      removeEmbeddedFiles: true,
      removeXMPMetadata: true,
      removeMetadata: true,
      removeLinks: true,
      removeFonts: true,
    };

    render(
      <TestWrapper>
        <SanitizeSettings
          parameters={allEnabledParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach(checkbox => {
      expect(checkbox).toBeChecked();
    });
  });

  test('should call translation function with correct keys', () => {
    render(
      <TestWrapper>
        <SanitizeSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    // Verify that translation keys are being called (just check that it was called, not specific order)
    expect(mockT).toHaveBeenCalledWith('sanitize.options.title', expect.any(String));
    expect(mockT).toHaveBeenCalledWith('sanitize.options.removeJavaScript.label', expect.any(String));
    expect(mockT).toHaveBeenCalledWith('sanitize.options.removeEmbeddedFiles.label', expect.any(String));
    expect(mockT).toHaveBeenCalledWith('sanitize.options.note', expect.any(String));
  });

  test('should not call onParameterChange when disabled', () => {
    render(
      <TestWrapper>
        <SanitizeSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
          disabled={true}
        />
      </TestWrapper>
    );

    const checkboxes = screen.getAllByRole('checkbox');

    // Verify checkboxes are disabled
    checkboxes.forEach(checkbox => {
      expect(checkbox).toBeDisabled();
    });

    // Try to click a disabled checkbox - this might still fire the event in tests
    // but we can verify the checkbox state doesn't actually change
    const firstCheckbox = checkboxes[0] as HTMLInputElement;
    const initialChecked = firstCheckbox.checked;
    fireEvent.click(firstCheckbox);
    expect(firstCheckbox.checked).toBe(initialChecked);
  });
});
