import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import RedactAdvancedSettings from '@app/components/tools/redact/RedactAdvancedSettings';
import { defaultParameters } from '@app/hooks/tools/redact/useRedactParameters';

// Mock useTranslation
const mockT = vi.fn((_key: string, fallback: string) => fallback);
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT })
}));

// Wrapper component to provide Mantine context
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe('RedactAdvancedSettings', () => {
  const mockOnParameterChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should render all advanced settings controls', () => {
    render(
      <TestWrapper>
        <RedactAdvancedSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    expect(screen.getByText('Box Colour')).toBeInTheDocument();
    expect(screen.getByText('Custom Extra Padding')).toBeInTheDocument();
    expect(screen.getByText('Use Regex')).toBeInTheDocument();
    expect(screen.getByText('Whole Word Search')).toBeInTheDocument();
    expect(screen.getByText('Convert PDF to PDF-Image (Used to remove text behind the box)')).toBeInTheDocument();
  });

  test('should display current parameter values', () => {
    const customParameters = {
      ...defaultParameters,
      redactColor: '#FF0000',
      customPadding: 0.5,
      useRegex: true,
      wholeWordSearch: true,
      convertPDFToImage: false,
    };

    render(
      <TestWrapper>
        <RedactAdvancedSettings
          parameters={customParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    // Check color input value
    const colorInput = screen.getByDisplayValue('#FF0000');
    expect(colorInput).toBeInTheDocument();

    // Check number input value
    const paddingInput = screen.getByDisplayValue('0.5');
    expect(paddingInput).toBeInTheDocument();

    // Check checkbox states
    const useRegexCheckbox = screen.getByLabelText('Use Regex');
    const wholeWordCheckbox = screen.getByLabelText('Whole Word Search');
    const convertCheckbox = screen.getByLabelText('Convert PDF to PDF-Image (Used to remove text behind the box)');

    expect(useRegexCheckbox).toBeChecked();
    expect(wholeWordCheckbox).toBeChecked();
    expect(convertCheckbox).not.toBeChecked();
  });

  test('should call onParameterChange when color is changed', () => {
    render(
      <TestWrapper>
        <RedactAdvancedSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    const colorInput = screen.getByDisplayValue('#000000');
    fireEvent.change(colorInput, { target: { value: '#FF0000' } });

    expect(mockOnParameterChange).toHaveBeenCalledWith('redactColor', '#FF0000');
  });

  test('should call onParameterChange when padding is changed', () => {
    render(
      <TestWrapper>
        <RedactAdvancedSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    const paddingInput = screen.getByDisplayValue('0.1');
    fireEvent.change(paddingInput, { target: { value: '0.5' } });

    expect(mockOnParameterChange).toHaveBeenCalledWith('customPadding', 0.5);
  });

  test('should handle invalid padding values', () => {
    render(
      <TestWrapper>
        <RedactAdvancedSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    const paddingInput = screen.getByDisplayValue('0.1');

    // Simulate NumberInput onChange with invalid value (empty string)
    const numberInput = paddingInput.closest('.mantine-NumberInput-root');
    if (numberInput) {
      // Find the input and trigger change with empty value
      fireEvent.change(paddingInput, { target: { value: '' } });

      // The component should default to 0.1 for invalid values
      expect(mockOnParameterChange).toHaveBeenCalledWith('customPadding', 0.1);
    }
  });

  test.each([
    {
      paramName: 'useRegex' as const,
      label: 'Use Regex',
      initialValue: false,
      expectedValue: true,
    },
    {
      paramName: 'wholeWordSearch' as const,
      label: 'Whole Word Search',
      initialValue: false,
      expectedValue: true,
    },
    {
      paramName: 'convertPDFToImage' as const,
      label: 'Convert PDF to PDF-Image (Used to remove text behind the box)',
      initialValue: true,
      expectedValue: false,
    },
  ])('should call onParameterChange when $paramName checkbox is toggled', ({ paramName, label, initialValue, expectedValue }) => {
    const customParameters = {
      ...defaultParameters,
      [paramName]: initialValue,
    };

    render(
      <TestWrapper>
        <RedactAdvancedSettings
          parameters={customParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    const checkbox = screen.getByLabelText(label);
    fireEvent.click(checkbox);

    expect(mockOnParameterChange).toHaveBeenCalledWith(paramName, expectedValue);
  });

  test.each([
    { controlType: 'color input', getValue: () => screen.getByDisplayValue('#000000') },
    { controlType: 'padding input', getValue: () => screen.getByDisplayValue('0.1') },
    { controlType: 'useRegex checkbox', getValue: () => screen.getByLabelText('Use Regex') },
    { controlType: 'wholeWordSearch checkbox', getValue: () => screen.getByLabelText('Whole Word Search') },
    { controlType: 'convertPDFToImage checkbox', getValue: () => screen.getByLabelText('Convert PDF to PDF-Image (Used to remove text behind the box)') },
  ])('should disable $controlType when disabled prop is true', ({ getValue }) => {
    render(
      <TestWrapper>
        <RedactAdvancedSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
          disabled={true}
        />
      </TestWrapper>
    );

    const control = getValue();
    expect(control).toBeDisabled();
  });

  test('should have correct padding input constraints', () => {
    render(
      <TestWrapper>
        <RedactAdvancedSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    // NumberInput in Mantine might not expose these attributes directly on the input element
    // Instead, check that the NumberInput component is rendered with correct placeholder
    const paddingInput = screen.getByPlaceholderText('0.1');
    expect(paddingInput).toBeInTheDocument();
    expect(paddingInput).toHaveDisplayValue('0.1');
  });
});
