import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import ButtonSelector from '@app/components/shared/ButtonSelector';

// Wrapper component to provide Mantine context
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe('ButtonSelector', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should render all options as buttons', () => {
    const options = [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
    ];

    render(
      <TestWrapper>
        <ButtonSelector
          value="option1"
          onChange={mockOnChange}
          options={options}
          label="Test Label"
        />
      </TestWrapper>
    );

    expect(screen.getByText('Test Label')).toBeInTheDocument();
    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(screen.getByText('Option 2')).toBeInTheDocument();
  });

  test('should highlight selected button with filled variant', () => {
    const options = [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
    ];

    render(
      <TestWrapper>
        <ButtonSelector
          value="option1"
          onChange={mockOnChange}
          options={options}
          label="Selection Label"
        />
      </TestWrapper>
    );

    const selectedButton = screen.getByRole('button', { name: 'Option 1' });
    const unselectedButton = screen.getByRole('button', { name: 'Option 2' });

    // Check data-variant attribute for filled/outline
    expect(selectedButton).toHaveAttribute('data-variant', 'filled');
    expect(unselectedButton).toHaveAttribute('data-variant', 'outline');
    expect(screen.getByText('Selection Label')).toBeInTheDocument();
  });

  test('should call onChange when button is clicked', () => {
    const options = [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
    ];

    render(
      <TestWrapper>
        <ButtonSelector
          value="option1"
          onChange={mockOnChange}
          options={options}
        />
      </TestWrapper>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Option 2' }));

    expect(mockOnChange).toHaveBeenCalledWith('option2');
  });

  test('should handle undefined value (no selection)', () => {
    const options = [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
    ];

    render(
      <TestWrapper>
        <ButtonSelector
          value={undefined}
          onChange={mockOnChange}
          options={options}
        />
      </TestWrapper>
    );

    // Both buttons should be outlined when no value is selected
    const button1 = screen.getByRole('button', { name: 'Option 1' });
    const button2 = screen.getByRole('button', { name: 'Option 2' });

    expect(button1).toHaveAttribute('data-variant', 'outline');
    expect(button2).toHaveAttribute('data-variant', 'outline');
  });

  test.each([
    {
      description: 'disable buttons when disabled prop is true',
      options: [
        { value: 'option1', label: 'Option 1' },
        { value: 'option2', label: 'Option 2' },
      ],
      globalDisabled: true,
      expectedStates: [true, true],
    },
    {
      description: 'disable individual options when option.disabled is true',
      options: [
        { value: 'option1', label: 'Option 1' },
        { value: 'option2', label: 'Option 2', disabled: true },
      ],
      globalDisabled: false,
      expectedStates: [false, true],
    },
  ])('should $description', ({ options, globalDisabled, expectedStates }) => {
    render(
      <TestWrapper>
        <ButtonSelector
          value="option1"
          onChange={mockOnChange}
          options={options}
          disabled={globalDisabled}
        />
      </TestWrapper>
    );

    options.forEach((option, index) => {
      const button = screen.getByRole('button', { name: option.label });
      expect(button).toHaveProperty('disabled', expectedStates[index]);
    });
  });

  test('should not call onChange when disabled button is clicked', () => {
    const options = [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2', disabled: true },
    ];

    render(
      <TestWrapper>
        <ButtonSelector
          value="option1"
          onChange={mockOnChange}
          options={options}
        />
      </TestWrapper>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Option 2' }));

    expect(mockOnChange).not.toHaveBeenCalled();
  });

  test('should not apply fullWidth styling when fullWidth is false', () => {
    const options = [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
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
      </TestWrapper>
    );

    const button = screen.getByRole('button', { name: 'Option 1' });
    expect(button).not.toHaveStyle({ flex: '1' });
    expect(screen.getByText('Layout Label')).toBeInTheDocument();
  });

  test('should not render label element when not provided', () => {
    const options = [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
    ];

    const { container } = render(
      <TestWrapper>
        <ButtonSelector
          value="option1"
          onChange={mockOnChange}
          options={options}
        />
      </TestWrapper>
    );

    // Should render buttons
    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(screen.getByText('Option 2')).toBeInTheDocument();
    
    // Stack should only contain the Group (buttons), no Text element for label
    const stackElement = container.querySelector('[class*="mantine-Stack-root"]');
    expect(stackElement?.children).toHaveLength(1); // Only the Group, no label Text
  });
});
