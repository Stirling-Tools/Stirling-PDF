import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n/config';
import { FileContextProvider } from '../contexts/FileContext';
import ConvertSettings from '../components/tools/convert/ConvertSettings';
import { useConvertParameters } from '../hooks/tools/convert/useConvertParameters';

// Mock the hooks
vi.mock('../hooks/tools/convert/useConvertParameters');
vi.mock('../hooks/useEndpointConfig');

const mockUseConvertParameters = vi.mocked(useConvertParameters);

// Mock endpoint availability - based on the real data you provided
const mockEndpointStatus = {
  'file-to-pdf': true,
  'img-to-pdf': true,
  'markdown-to-pdf': true,
  'pdf-to-csv': true,
  'pdf-to-img': true,
  'pdf-to-text': true,
  'eml-to-pdf': false,
  'html-to-pdf': false,
  'pdf-to-html': false,
  'pdf-to-markdown': false,
  'pdf-to-pdfa': false,
  'pdf-to-presentation': false,
  'pdf-to-word': false,
  'pdf-to-xml': false
};

// Mock useMultipleEndpointsEnabled
vi.mock('../hooks/useEndpointConfig', () => ({
  useMultipleEndpointsEnabled: () => ({
    endpointStatus: mockEndpointStatus,
    loading: false,
    error: null
  })
}));

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MantineProvider>
    <I18nextProvider i18n={i18n}>
      <FileContextProvider>
        {children}
      </FileContextProvider>
    </I18nextProvider>
  </MantineProvider>
);

describe('Convert Tool Navigation Tests', () => {
  const mockOnParameterChange = vi.fn();
  const mockGetAvailableToExtensions = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockUseConvertParameters.mockReturnValue({
      parameters: {
        fromExtension: '',
        toExtension: '',
        imageOptions: {
          colorType: 'color',
          dpi: 300,
          singleOrMultiple: 'multiple'
        }
      },
      updateParameter: mockOnParameterChange,
      resetParameters: vi.fn(),
      validateParameters: vi.fn(() => true),
      getEndpointName: vi.fn(() => ''),
      getEndpoint: vi.fn(() => ''),
      getAvailableToExtensions: mockGetAvailableToExtensions,
      detectFileExtension: vi.fn()
    });
  });

  describe('FROM Dropdown - Endpoint Availability', () => {
    test('should enable formats with available endpoints', async () => {
      // Mock available conversions for formats with working endpoints
      mockGetAvailableToExtensions.mockImplementation((fromExt) => {
        const mockConversions = {
          'pdf': [{ value: 'png', label: 'PNG', group: 'Image' }, { value: 'csv', label: 'CSV', group: 'Spreadsheet' }],
          'docx': [{ value: 'pdf', label: 'PDF', group: 'Document' }],
          'png': [{ value: 'pdf', label: 'PDF', group: 'Document' }],
          'md': [{ value: 'pdf', label: 'PDF', group: 'Document' }],
          'eml': [{ value: 'pdf', label: 'PDF', group: 'Document' }],
          'html': [{ value: 'pdf', label: 'PDF', group: 'Document' }]
        };
        return mockConversions[fromExt] || [];
      });

      render(
        <TestWrapper>
          <ConvertSettings
            parameters={{
              fromExtension: '',
              toExtension: '',
              imageOptions: { colorType: 'color', dpi: 300, singleOrMultiple: 'multiple' }
            }}
            onParameterChange={mockOnParameterChange}
            getAvailableToExtensions={mockGetAvailableToExtensions}
          />
        </TestWrapper>
      );

      // Open FROM dropdown by test id
      const fromDropdown = screen.getByTestId('convert-from-dropdown');
      fireEvent.click(fromDropdown);

      await waitFor(() => {
        // Should enable formats with available endpoints
        expect(screen.getByTestId('format-option-pdf')).not.toBeDisabled();
        expect(screen.getByTestId('format-option-docx')).not.toBeDisabled();
        expect(screen.getByTestId('format-option-png')).not.toBeDisabled();
        expect(screen.getByTestId('format-option-md')).not.toBeDisabled();
        
        // Should disable formats without available endpoints
        const emlButton = screen.getByTestId('format-option-eml');
        expect(emlButton).toBeDisabled();
      });
    });

    test('should show correct format groups', async () => {
      render(
        <TestWrapper>
          <ConvertSettings
            parameters={{
              fromExtension: '',
              toExtension: '',
              imageOptions: { colorType: 'color', dpi: 300, singleOrMultiple: 'multiple' }
            }}
            onParameterChange={mockOnParameterChange}
            getAvailableToExtensions={mockGetAvailableToExtensions}
          />
        </TestWrapper>
      );

      const fromDropdown = screen.getByTestId('convert-from-dropdown');
      fireEvent.click(fromDropdown);

      await waitFor(() => {
        // Check if format groups are displayed
        expect(screen.getByText('Document')).toBeInTheDocument();
        expect(screen.getByText('Image')).toBeInTheDocument();
        expect(screen.getByText('Text')).toBeInTheDocument();
        expect(screen.getByText('Email')).toBeInTheDocument();
      });
    });
  });

  describe('TO Dropdown - Available Conversions', () => {
    test('should show available conversions for PDF', async () => {
      // Mock PDF conversions
      mockGetAvailableToExtensions.mockReturnValue([
        { value: 'png', label: 'PNG', group: 'Image' },
        { value: 'csv', label: 'CSV', group: 'Spreadsheet' },
        { value: 'txt', label: 'TXT', group: 'Text' },
        { value: 'docx', label: 'DOCX', group: 'Document' },
        { value: 'html', label: 'HTML', group: 'Web' }
      ]);

      render(
        <TestWrapper>
          <ConvertSettings
            parameters={{
              fromExtension: 'pdf',
              toExtension: '',
              imageOptions: { colorType: 'color', dpi: 300, singleOrMultiple: 'multiple' }
            }}
            onParameterChange={mockOnParameterChange}
            getAvailableToExtensions={mockGetAvailableToExtensions}
          />
        </TestWrapper>
      );

      // Open TO dropdown
      const toDropdown = screen.getByTestId('convert-to-dropdown');
      fireEvent.click(toDropdown);

      await waitFor(() => {
        // Should enable formats with available endpoints
        expect(screen.getByTestId('format-option-png')).not.toBeDisabled();
        expect(screen.getByTestId('format-option-csv')).not.toBeDisabled();
        expect(screen.getByTestId('format-option-txt')).not.toBeDisabled();
        
        // Should disable formats without available endpoints
        expect(screen.getByTestId('format-option-docx')).toBeDisabled(); // pdf-to-word is false
        expect(screen.getByTestId('format-option-html')).toBeDisabled();  // pdf-to-html is false
      });
    });

    test('should show image-specific options when converting to image formats', async () => {
      mockGetAvailableToExtensions.mockReturnValue([
        { value: 'png', label: 'PNG', group: 'Image' }
      ]);

      render(
        <TestWrapper>
          <ConvertSettings
            parameters={{
              fromExtension: 'pdf',
              toExtension: 'png',
              imageOptions: { colorType: 'color', dpi: 300, singleOrMultiple: 'multiple' }
            }}
            onParameterChange={mockOnParameterChange}
            getAvailableToExtensions={mockGetAvailableToExtensions}
          />
        </TestWrapper>
      );

      // Should show image conversion settings
      await waitFor(() => {
        expect(screen.getByTestId('image-options-section')).toBeInTheDocument();
        expect(screen.getByTestId('dpi-input')).toHaveValue('300');
      });
    });

    test('should show email-specific note for EML conversions', async () => {
      mockGetAvailableToExtensions.mockReturnValue([
        { value: 'pdf', label: 'PDF', group: 'Document' }
      ]);

      render(
        <TestWrapper>
          <ConvertSettings
            parameters={{
              fromExtension: 'eml',
              toExtension: 'pdf',
              imageOptions: { colorType: 'color', dpi: 300, singleOrMultiple: 'multiple' }
            }}
            onParameterChange={mockOnParameterChange}
            getAvailableToExtensions={mockGetAvailableToExtensions}
          />
        </TestWrapper>
      );

      // Should show EML-specific options
      await waitFor(() => {
        expect(screen.getByTestId('eml-options-section')).toBeInTheDocument();
        expect(screen.getByTestId('eml-options-note')).toBeInTheDocument();
      });
    });
  });

  describe('Conversion Flow Navigation', () => {
    test('should reset TO extension when FROM extension changes', async () => {
      mockGetAvailableToExtensions.mockImplementation((fromExt) => {
        if (fromExt === 'pdf') return [{ value: 'png', label: 'PNG', group: 'Image' }];
        if (fromExt === 'docx') return [{ value: 'pdf', label: 'PDF', group: 'Document' }];
        return [];
      });

      render(
        <TestWrapper>
          <ConvertSettings
            parameters={{
              fromExtension: 'pdf',
              toExtension: 'png',
              imageOptions: { colorType: 'color', dpi: 300, singleOrMultiple: 'multiple' }
            }}
            onParameterChange={mockOnParameterChange}
            getAvailableToExtensions={mockGetAvailableToExtensions}
          />
        </TestWrapper>
      );

      // Select a different FROM format
      const fromDropdown = screen.getByTestId('convert-from-dropdown');
      fireEvent.click(fromDropdown);
      
      await waitFor(() => {
        const docxButton = screen.getByTestId('format-option-docx');
        fireEvent.click(docxButton);
      });

      // Should reset TO extension
      expect(mockOnParameterChange).toHaveBeenCalledWith('fromExtension', 'docx');
      expect(mockOnParameterChange).toHaveBeenCalledWith('toExtension', '');
    });

    test('should show placeholder when no FROM format is selected', () => {
      render(
        <TestWrapper>
          <ConvertSettings
            parameters={{
              fromExtension: '',
              toExtension: '',
              imageOptions: { colorType: 'color', dpi: 300, singleOrMultiple: 'multiple' }
            }}
            onParameterChange={mockOnParameterChange}
            getAvailableToExtensions={mockGetAvailableToExtensions}
          />
        </TestWrapper>
      );

      // TO dropdown should show disabled state
      expect(screen.getByText('Select a source format first')).toBeInTheDocument();
    });
  });
});