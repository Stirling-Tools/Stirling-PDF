import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import MergeSettings from '@app/components/tools/merge/MergeSettings';
import { MergeParameters } from '@app/hooks/tools/merge/useMergeParameters';

// Mock useTranslation with predictable return values
const mockT = vi.fn((key: string) => `mock-${key}`);
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT })
}));

// Wrapper component to provide Mantine context
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe('MergeSettings', () => {
  const defaultParameters: MergeParameters = {
    removeDigitalSignature: false,
    generateTableOfContents: false,
  };

  const mockOnParameterChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should render both merge option checkboxes', () => {
    render(
      <TestWrapper>
        <MergeSettings
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
        <MergeSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    const checkboxes = screen.getAllByRole('checkbox');

    // Both checkboxes should be unchecked initially
    checkboxes.forEach(checkbox => {
      expect(checkbox).not.toBeChecked();
    });
  });

  test('should call onParameterChange with correct parameters when checkboxes are clicked', () => {
    render(
      <TestWrapper>
        <MergeSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    const checkboxes = screen.getAllByRole('checkbox');

    // Click the first checkbox (removeDigitalSignature - should toggle from false to true)
    fireEvent.click(checkboxes[0]);
    expect(mockOnParameterChange).toHaveBeenCalledWith('removeDigitalSignature', true);

    // Click the second checkbox (generateTableOfContents - should toggle from false to true)
    fireEvent.click(checkboxes[1]);
    expect(mockOnParameterChange).toHaveBeenCalledWith('generateTableOfContents', true);
  });

  test('should call translation function with correct keys', () => {
    render(
      <TestWrapper>
        <MergeSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    // Verify that translation keys are being called
    expect(mockT).toHaveBeenCalledWith('merge.removeDigitalSignature.label', 'Remove digital signature in the merged file?');
    expect(mockT).toHaveBeenCalledWith('merge.generateTableOfContents.label', 'Generate table of contents in the merged file?');
  });
  
});
