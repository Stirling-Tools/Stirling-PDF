import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import WordsToRedactInput from '@app/components/tools/redact/WordsToRedactInput';

// Mock useTranslation
const mockT = vi.fn((_key: string, fallback: string) => fallback);
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT })
}));

// Wrapper component to provide Mantine context
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe('WordsToRedactInput', () => {
  const mockOnWordsChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should render with title and input field', () => {
    render(
      <TestWrapper>
        <WordsToRedactInput
          wordsToRedact={[]}
          onWordsChange={mockOnWordsChange}
        />
      </TestWrapper>
    );

    expect(screen.getByText('Words to Redact')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter a word')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add' })).toBeInTheDocument();
  });

  test.each([
    { trigger: 'Add button click', action: (_input: HTMLElement, addButton: HTMLElement) => fireEvent.click(addButton) },
    { trigger: 'Enter key press', action: (input: HTMLElement) => fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' }) },
  ])('should add word when $trigger', ({ action }) => {
    render(
      <TestWrapper>
        <WordsToRedactInput
          wordsToRedact={[]}
          onWordsChange={mockOnWordsChange}
        />
      </TestWrapper>
    );

    const input = screen.getByPlaceholderText('Enter a word');
    const addButton = screen.getByRole('button', { name: '+ Add' });

    fireEvent.change(input, { target: { value: 'TestWord' } });
    action(input, addButton);

    expect(mockOnWordsChange).toHaveBeenCalledWith(['TestWord']);
  });

  test('should not add empty word', () => {
    render(
      <TestWrapper>
        <WordsToRedactInput
          wordsToRedact={[]}
          onWordsChange={mockOnWordsChange}
        />
      </TestWrapper>
    );

    const addButton = screen.getByRole('button', { name: '+ Add' });

    fireEvent.click(addButton);

    expect(mockOnWordsChange).not.toHaveBeenCalled();
  });

  test('should not add duplicate word', () => {
    render(
      <TestWrapper>
        <WordsToRedactInput
          wordsToRedact={['Existing']}
          onWordsChange={mockOnWordsChange}
        />
      </TestWrapper>
    );

    const input = screen.getByPlaceholderText('Enter a word');
    const addButton = screen.getByRole('button', { name: '+ Add' });

    fireEvent.change(input, { target: { value: 'Existing' } });
    fireEvent.click(addButton);

    expect(mockOnWordsChange).not.toHaveBeenCalled();
  });

  test('should trim whitespace when adding word', () => {
    render(
      <TestWrapper>
        <WordsToRedactInput
          wordsToRedact={[]}
          onWordsChange={mockOnWordsChange}
        />
      </TestWrapper>
    );

    const input = screen.getByPlaceholderText('Enter a word');
    const addButton = screen.getByRole('button', { name: '+ Add' });

    fireEvent.change(input, { target: { value: '  TestWord  ' } });
    fireEvent.click(addButton);

    expect(mockOnWordsChange).toHaveBeenCalledWith(['TestWord']);
  });

  test('should remove word when x button is clicked', () => {
    render(
      <TestWrapper>
        <WordsToRedactInput
          wordsToRedact={['Word1', 'Word2']}
          onWordsChange={mockOnWordsChange}
        />
      </TestWrapper>
    );

    const removeButtons = screen.getAllByText('×');
    fireEvent.click(removeButtons[0]);

    expect(mockOnWordsChange).toHaveBeenCalledWith(['Word2']);
  });

  test('should clear input after adding word', () => {
    render(
      <TestWrapper>
        <WordsToRedactInput
          wordsToRedact={[]}
          onWordsChange={mockOnWordsChange}
        />
      </TestWrapper>
    );

    const input = screen.getByPlaceholderText('Enter a word') as HTMLInputElement;
    const addButton = screen.getByRole('button', { name: '+ Add' });

    fireEvent.change(input, { target: { value: 'TestWord' } });
    fireEvent.click(addButton);

    expect(input.value).toBe('');
  });

  test.each([
    { description: 'disable Add button when input is empty', inputValue: '', expectedDisabled: true },
    { description: 'enable Add button when input has text', inputValue: 'TestWord', expectedDisabled: false },
  ])('should $description', ({ inputValue, expectedDisabled }) => {
    render(
      <TestWrapper>
        <WordsToRedactInput
          wordsToRedact={[]}
          onWordsChange={mockOnWordsChange}
        />
      </TestWrapper>
    );

    const input = screen.getByPlaceholderText('Enter a word');
    const addButton = screen.getByRole('button', { name: '+ Add' });

    fireEvent.change(input, { target: { value: inputValue } });

    expect(addButton).toHaveProperty('disabled', expectedDisabled);
  });

  test('should disable all controls when disabled prop is true', () => {
    render(
      <TestWrapper>
        <WordsToRedactInput
          wordsToRedact={['Word1']}
          onWordsChange={mockOnWordsChange}
          disabled={true}
        />
      </TestWrapper>
    );

    const input = screen.getByPlaceholderText('Enter a word');
    const addButton = screen.getByRole('button', { name: '+ Add' });
    const removeButton = screen.getByText('×');

    expect(input).toBeDisabled();
    expect(addButton).toBeDisabled();
    expect(removeButton.closest('button')).toBeDisabled();
  });
});
