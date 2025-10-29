import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import AdjustPageScaleSettings from '@app/components/tools/adjustPageScale/AdjustPageScaleSettings';
import { AdjustPageScaleParameters, PageSize } from '@app/hooks/tools/adjustPageScale/useAdjustPageScaleParameters';

// Mock useTranslation with predictable return values
const mockT = vi.fn((key: string, fallback?: string) => fallback || `mock-${key}`);
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT })
}));

// Wrapper component to provide Mantine context
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe('AdjustPageScaleSettings', () => {
  const defaultParameters: AdjustPageScaleParameters = {
    scaleFactor: 1.0,
    pageSize: PageSize.KEEP,
  };

  const mockOnParameterChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should render without crashing', () => {
    render(
      <TestWrapper>
        <AdjustPageScaleSettings
          parameters={defaultParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    // Basic render test - component renders without throwing
    expect(screen.getByText('Scale Factor')).toBeInTheDocument();
    expect(screen.getByText('Target Page Size')).toBeInTheDocument();
  });

  test('should render with custom parameters', () => {
    const customParameters: AdjustPageScaleParameters = {
      scaleFactor: 2.5,
      pageSize: PageSize.A4,
    };

    render(
      <TestWrapper>
        <AdjustPageScaleSettings
          parameters={customParameters}
          onParameterChange={mockOnParameterChange}
        />
      </TestWrapper>
    );

    // Component renders successfully with custom parameters
    expect(screen.getByText('Scale Factor')).toBeInTheDocument();
    expect(screen.getByText('Target Page Size')).toBeInTheDocument();
  });
});
