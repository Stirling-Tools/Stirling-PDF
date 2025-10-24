import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import ChangePermissionsSettings from '@app/components/tools/changePermissions/ChangePermissionsSettings';
import { defaultParameters } from '@app/hooks/tools/changePermissions/useChangePermissionsParameters';
import type { ChangePermissionsParameters } from '@app/hooks/tools/changePermissions/useChangePermissionsParameters';

// Mock useTranslation with predictable return values
const mockT = vi.fn((key: string) => `mock-${key}`);
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT })
}));

// Wrapper component to provide Mantine context
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe('ChangePermissionsSettings', () => {
  const mockOnParameterChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should render all permission checkboxes', () => {
    render(
      <TestWrapper>
        <ChangePermissionsSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    // Should render checkboxes for all permission types
    const permissionKeys = Object.keys(defaultParameters) as Array<keyof ChangePermissionsParameters>;
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(permissionKeys.length);

    // Verify specific permission labels are rendered
    expect(screen.getByText('mock-changePermissions.permissions.preventAssembly.label')).toBeInTheDocument();
    expect(screen.getByText('mock-changePermissions.permissions.preventPrinting.label')).toBeInTheDocument();
    expect(screen.getByText('mock-changePermissions.permissions.preventModify.label')).toBeInTheDocument();
    expect(screen.getByText('mock-changePermissions.permissions.preventExtractContent.label')).toBeInTheDocument();
  });

  test('should render all permission types with correct labels', () => {
    render(
      <TestWrapper>
        <ChangePermissionsSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    const permissionKeys = Object.keys(defaultParameters) as Array<keyof ChangePermissionsParameters>;

    permissionKeys.forEach(permission => {
      expect(screen.getByText(`mock-changePermissions.permissions.${permission}.label`)).toBeInTheDocument();
    });
  });

  test('should show checkboxes as unchecked by default', () => {
    render(
      <TestWrapper>
        <ChangePermissionsSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    checkboxes.forEach(checkbox => {
      expect(checkbox.checked).toBe(false);
    });
  });

  test('should show checkboxes as checked when parameters are true', () => {
    const checkedParameters: ChangePermissionsParameters = {
      ...defaultParameters,
      preventAssembly: true,
      preventPrinting: true,
      preventModify: true
    };

    render(
      <TestWrapper>
        <ChangePermissionsSettings
          parameters={checkedParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    // Find specific checkboxes by their labels and verify they are checked
    const assemblyCheckbox = screen.getByLabelText('mock-changePermissions.permissions.preventAssembly.label') as HTMLInputElement;
    const printingCheckbox = screen.getByLabelText('mock-changePermissions.permissions.preventPrinting.label') as HTMLInputElement;
    const modifyCheckbox = screen.getByLabelText('mock-changePermissions.permissions.preventModify.label') as HTMLInputElement;
    const formCheckbox = screen.getByLabelText('mock-changePermissions.permissions.preventFillInForm.label') as HTMLInputElement;

    expect(assemblyCheckbox.checked).toBe(true);
    expect(printingCheckbox.checked).toBe(true);
    expect(modifyCheckbox.checked).toBe(true);
    expect(formCheckbox.checked).toBe(false);  // Ensure other checkboxes are unaffected
  });

  test.each([
    { initialValue: false, expectedValue: true, description: 'checking an unchecked box' },
    { initialValue: true, expectedValue: false, description: 'unchecking a checked box' }
  ])('should call onParameterChange with $expectedValue when $description', ({ initialValue, expectedValue }) => {
    const testParameters: ChangePermissionsParameters = {
      ...defaultParameters,
      preventAssembly: initialValue
    };

    render(
      <TestWrapper>
        <ChangePermissionsSettings
          parameters={testParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    const assemblyCheckbox = screen.getByLabelText('mock-changePermissions.permissions.preventAssembly.label');
    fireEvent.click(assemblyCheckbox);

    expect(mockOnParameterChange).toHaveBeenCalledWith('preventAssembly', expectedValue);
  });

  test('should handle multiple checkbox interactions', () => {
    render(
      <TestWrapper>
        <ChangePermissionsSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    // Click multiple checkboxes
    const assemblyCheckbox = screen.getByLabelText('mock-changePermissions.permissions.preventAssembly.label');
    const printingCheckbox = screen.getByLabelText('mock-changePermissions.permissions.preventPrinting.label');

    fireEvent.click(assemblyCheckbox);
    fireEvent.click(printingCheckbox);

    expect(mockOnParameterChange).toHaveBeenCalledWith('preventAssembly', true);
    expect(mockOnParameterChange).toHaveBeenCalledWith('preventPrinting', true);
    expect(mockOnParameterChange).toHaveBeenCalledTimes(2);
  });

  test.each([
    { disabled: true, expectedState: true },
    { disabled: false, expectedState: false }
  ])('should set checkboxes disabled=$disabled when disabled prop is $disabled', ({ disabled, expectedState }) => {
    render(
      <TestWrapper>
        <ChangePermissionsSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
          disabled={disabled}
        />
      </TestWrapper>
    );

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    checkboxes.forEach(checkbox => {
      expect(checkbox.disabled).toBe(expectedState);
    });
  });

  test('should call translation function with correct keys', () => {
    render(
      <TestWrapper>
        <ChangePermissionsSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    const permissionKeys = Object.keys(defaultParameters) as Array<keyof ChangePermissionsParameters>;
    permissionKeys.forEach(permission => {
      expect(mockT).toHaveBeenCalledWith(`changePermissions.permissions.${permission}.label`, permission);
    });
  });

  test.each(Object.keys(defaultParameters) as Array<keyof ChangePermissionsParameters>)('should handle %s permission type individually', (permission) => {
    const testParameters: ChangePermissionsParameters = {
      ...defaultParameters,
      [permission]: true
    };

    render(
      <TestWrapper>
        <ChangePermissionsSettings
          parameters={testParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    const checkbox = screen.getByLabelText(`mock-changePermissions.permissions.${permission}.label`) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });
});
