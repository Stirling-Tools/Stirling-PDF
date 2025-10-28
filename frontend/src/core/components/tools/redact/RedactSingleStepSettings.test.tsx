import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import RedactSingleStepSettings from '@app/components/tools/redact/RedactSingleStepSettings';
import { defaultParameters } from '@app/hooks/tools/redact/useRedactParameters';

// Mock useTranslation
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: vi.fn((_key: string, fallback: string) => fallback) })
}));

// Wrapper component to provide Mantine context
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe('RedactSingleStepSettings', () => {
  const mockOnParameterChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should render mode selector', () => {
    render(
      <TestWrapper>
        <RedactSingleStepSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    expect(screen.getByText('Mode')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Automatic' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manual' })).toBeInTheDocument();
  });

  test('should render automatic mode settings when mode is automatic', () => {
    render(
      <TestWrapper>
        <RedactSingleStepSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    // Default mode is automatic, so these should be visible
    expect(screen.getByText('Words to Redact')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter a word')).toBeInTheDocument();
    expect(screen.getByText('Box Colour')).toBeInTheDocument();
    expect(screen.getByText('Use Regex')).toBeInTheDocument();
  });

  test('should render manual mode settings when mode is manual', () => {
    const manualParameters = {
      ...defaultParameters,
      mode: 'manual' as const,
    };

    render(
      <TestWrapper>
        <RedactSingleStepSettings
          parameters={manualParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    // Manual mode should show placeholder text
    expect(screen.getByText('Manual redaction interface will be available here when implemented.')).toBeInTheDocument();

    // Automatic mode settings should not be visible
    expect(screen.queryByText('Words to Redact')).not.toBeInTheDocument();
  });

  test('should pass through parameter changes from automatic settings', () => {
    render(
      <TestWrapper>
        <RedactSingleStepSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    // Test adding a word
    const input = screen.getByPlaceholderText('Enter a word');
    const addButton = screen.getByRole('button', { name: '+ Add' });

    fireEvent.change(input, { target: { value: 'TestWord' } });
    fireEvent.click(addButton);

    expect(mockOnParameterChange).toHaveBeenCalledWith('wordsToRedact', ['TestWord']);
  });

  test('should pass through parameter changes from advanced settings', () => {
    render(
      <TestWrapper>
        <RedactSingleStepSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    // Test changing color
    const colorInput = screen.getByDisplayValue('#000000');
    fireEvent.change(colorInput, { target: { value: '#FF0000' } });

    expect(mockOnParameterChange).toHaveBeenCalledWith('redactColor', '#FF0000');
  });

  test('should disable all controls when disabled prop is true', () => {
    render(
      <TestWrapper>
        <RedactSingleStepSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
          disabled={true}
        />
      </TestWrapper>
    );

    // Mode selector buttons should be disabled
    expect(screen.getByRole('button', { name: 'Automatic' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Manual' })).toBeDisabled();

    // Automatic settings controls should be disabled
    expect(screen.getByPlaceholderText('Enter a word')).toBeDisabled();
    expect(screen.getByRole('button', { name: '+ Add' })).toBeDisabled();
    expect(screen.getByDisplayValue('#000000')).toBeDisabled();
  });

  test('should show current parameter values in automatic mode', () => {
    const customParameters = {
      ...defaultParameters,
      wordsToRedact: ['Word1', 'Word2'],
      redactColor: '#FF0000',
      useRegex: true,
      customPadding: 0.5,
    };

    render(
      <TestWrapper>
        <RedactSingleStepSettings
          parameters={customParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    // Check that word tags are displayed
    expect(screen.getByText('Word1')).toBeInTheDocument();
    expect(screen.getByText('Word2')).toBeInTheDocument();

    // Check that color is displayed
    expect(screen.getByDisplayValue('#FF0000')).toBeInTheDocument();

    // Check that regex checkbox is checked
    const useRegexCheckbox = screen.getByLabelText('Use Regex');
    expect(useRegexCheckbox).toBeChecked();

    // Check that padding value is displayed
    expect(screen.getByDisplayValue('0.5')).toBeInTheDocument();
  });

  test('should maintain consistent spacing and layout', () => {
    render(
      <TestWrapper>
        <RedactSingleStepSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    // Check that the Stack container exists
    const container = screen.getByText('Mode').closest('.mantine-Stack-root');
    expect(container).toBeInTheDocument();
  });
});
