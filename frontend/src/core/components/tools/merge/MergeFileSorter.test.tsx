import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import MergeFileSorter from '@app/components/tools/merge/MergeFileSorter';

// Mock useTranslation with predictable return values
const mockT = vi.fn((key: string) => `mock-${key}`);
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT })
}));

// Wrapper component to provide Mantine context
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe('MergeFileSorter', () => {
  const mockOnSortFiles = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should render sort options dropdown, direction toggle, and sort button', () => {
    render(
      <TestWrapper>
        <MergeFileSorter onSortFiles={mockOnSortFiles} />
      </TestWrapper>
    );

    // Should have a select dropdown (Mantine Select uses textbox role)
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    // Should have direction toggle button
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2); // ActionIcon + Sort Button

    // Should have sort button with text
    expect(screen.getByText('mock-merge.sortBy.sort')).toBeInTheDocument();
  });

  test('should render description text', () => {
    render(
      <TestWrapper>
        <MergeFileSorter onSortFiles={mockOnSortFiles} />
      </TestWrapper>
    );

    expect(screen.getByText('mock-merge.sortBy.description')).toBeInTheDocument();
  });

  test('should have filename selected by default', () => {
    render(
      <TestWrapper>
        <MergeFileSorter onSortFiles={mockOnSortFiles} />
      </TestWrapper>
    );

    const select = screen.getByRole('textbox');
    expect(select).toHaveValue('mock-merge.sortBy.filename');
  });

  test('should show ascending direction by default', () => {
    render(
      <TestWrapper>
        <MergeFileSorter onSortFiles={mockOnSortFiles} />
      </TestWrapper>
    );

    // Should show ascending arrow icon
    const directionButton = screen.getAllByRole('button')[0];
    expect(directionButton).toHaveAttribute('title', 'mock-merge.sortBy.ascending');
  });

  test('should toggle direction when direction button is clicked', () => {
    render(
      <TestWrapper>
        <MergeFileSorter onSortFiles={mockOnSortFiles} />
      </TestWrapper>
    );

    const directionButton = screen.getAllByRole('button')[0];

    // Initially ascending
    expect(directionButton).toHaveAttribute('title', 'mock-merge.sortBy.ascending');

    // Click to toggle to descending
    fireEvent.click(directionButton);
    expect(directionButton).toHaveAttribute('title', 'mock-merge.sortBy.descending');

    // Click again to toggle back to ascending
    fireEvent.click(directionButton);
    expect(directionButton).toHaveAttribute('title', 'mock-merge.sortBy.ascending');
  });

  test('should call onSortFiles with correct parameters when sort button is clicked', () => {
    render(
      <TestWrapper>
        <MergeFileSorter onSortFiles={mockOnSortFiles} />
      </TestWrapper>
    );

    const sortButton = screen.getByText('mock-merge.sortBy.sort');
    fireEvent.click(sortButton);

    // Should be called with default values (filename, ascending)
    expect(mockOnSortFiles).toHaveBeenCalledWith('filename', true);
  });

  test('should call onSortFiles with dateModified when dropdown is changed', () => {
    render(
      <TestWrapper>
        <MergeFileSorter onSortFiles={mockOnSortFiles} />
      </TestWrapper>
    );

    // Open the dropdown by clicking on the current selected value
    const currentSelection = screen.getByText('mock-merge.sortBy.filename');
    fireEvent.mouseDown(currentSelection);
    
    // Click on the dateModified option
    const dateModifiedOption = screen.getByText('mock-merge.sortBy.dateModified');
    fireEvent.click(dateModifiedOption);

    const sortButton = screen.getByText('mock-merge.sortBy.sort');
    fireEvent.click(sortButton);

    expect(mockOnSortFiles).toHaveBeenCalledWith('dateModified', true);
  });

  test('should call onSortFiles with descending direction when toggled', () => {
    render(
      <TestWrapper>
        <MergeFileSorter onSortFiles={mockOnSortFiles} />
      </TestWrapper>
    );

    const directionButton = screen.getAllByRole('button')[0];
    const sortButton = screen.getByText('mock-merge.sortBy.sort');

    // Toggle to descending
    fireEvent.click(directionButton);

    // Click sort
    fireEvent.click(sortButton);

    expect(mockOnSortFiles).toHaveBeenCalledWith('filename', false);
  });

  test('should handle complex user interaction sequence', () => {
    render(
      <TestWrapper>
        <MergeFileSorter onSortFiles={mockOnSortFiles} />
      </TestWrapper>
    );

    const directionButton = screen.getAllByRole('button')[0];
    const sortButton = screen.getByText('mock-merge.sortBy.sort');

    // 1. Change to dateModified
    const currentSelection = screen.getByText('mock-merge.sortBy.filename');
    fireEvent.mouseDown(currentSelection);
    const dateModifiedOption = screen.getByText('mock-merge.sortBy.dateModified');
    fireEvent.click(dateModifiedOption);

    // 2. Toggle to descending
    fireEvent.click(directionButton);

    // 3. Click sort
    fireEvent.click(sortButton);

    expect(mockOnSortFiles).toHaveBeenCalledWith('dateModified', false);

    // 4. Toggle back to ascending
    fireEvent.click(directionButton);

    // 5. Sort again
    fireEvent.click(sortButton);

    expect(mockOnSortFiles).toHaveBeenCalledWith('dateModified', true);
  });
});
