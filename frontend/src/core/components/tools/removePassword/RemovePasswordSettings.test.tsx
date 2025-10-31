import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import RemovePasswordSettings from '@app/components/tools/removePassword/RemovePasswordSettings';
import { defaultParameters } from '@app/hooks/tools/removePassword/useRemovePasswordParameters';

// Mock useTranslation with predictable return values
const mockT = vi.fn((key: string) => `mock-${key}`);
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT })
}));

// Wrapper component to provide Mantine context
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe('RemovePasswordSettings', () => {
  const mockOnParameterChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should render password input field', () => {
    render(
      <TestWrapper>
        <RemovePasswordSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    expect(screen.getByText('mock-removePassword.password.label')).toBeInTheDocument();
  });

  test('should call onParameterChange when password is entered', () => {
    render(
      <TestWrapper>
        <RemovePasswordSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    const passwordInput = screen.getByPlaceholderText('mock-removePassword.password.placeholder');
    fireEvent.change(passwordInput, { target: { value: 'test-password' } });

    expect(mockOnParameterChange).toHaveBeenCalledWith('password', 'test-password');
  });

  test('should display current password value', () => {
    const parametersWithPassword = { ...defaultParameters, password: 'current-password' };

    render(
      <TestWrapper>
        <RemovePasswordSettings
          parameters={parametersWithPassword}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    const passwordInput = screen.getByPlaceholderText('mock-removePassword.password.placeholder') as HTMLInputElement;
    expect(passwordInput.value).toBe('current-password');
  });

  test('should disable password input when disabled prop is true', () => {
    render(
      <TestWrapper>
        <RemovePasswordSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
          disabled={true}
        />
      </TestWrapper>
    );

    const passwordInput = screen.getByPlaceholderText('mock-removePassword.password.placeholder');
    expect(passwordInput).toBeDisabled();
  });

  test('should enable password input when disabled prop is false', () => {
    render(
      <TestWrapper>
        <RemovePasswordSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
          disabled={false}
        />
      </TestWrapper>
    );

    const passwordInput = screen.getByPlaceholderText('mock-removePassword.password.placeholder');
    expect(passwordInput).not.toBeDisabled();
  });

  test('should show password input as required', () => {
    render(
      <TestWrapper>
        <RemovePasswordSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    const passwordInput = screen.getByPlaceholderText('mock-removePassword.password.placeholder');
    expect(passwordInput).toHaveAttribute('required');
  });

  test('should call translation function with correct keys', () => {
    render(
      <TestWrapper>
        <RemovePasswordSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    expect(mockT).toHaveBeenCalledWith('removePassword.password.label', 'Current Password');
    expect(mockT).toHaveBeenCalledWith('removePassword.password.placeholder', 'Enter current password');
  });
});
