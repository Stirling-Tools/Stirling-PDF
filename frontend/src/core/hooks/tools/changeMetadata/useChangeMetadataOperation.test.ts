import { buildChangeMetadataFormData } from '@app/hooks/tools/changeMetadata/useChangeMetadataOperation';
import { ChangeMetadataParameters } from '@app/hooks/tools/changeMetadata/useChangeMetadataParameters';
import { TrappedStatus } from '@app/types/metadata';
import { describe, expect, test } from 'vitest';

describe('buildChangeMetadataFormData', () => {
  const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });

  const defaultParams: ChangeMetadataParameters = {
    title: '',
    author: '',
    subject: '',
    keywords: '',
    creator: '',
    producer: '',
    creationDate: null,
    modificationDate: null,
    trapped: TrappedStatus.UNKNOWN,
    customMetadata: [],
    deleteAll: false,
  };

  test.each([
    {
      name: 'should build FormData with basic parameters',
      params: {
        ...defaultParams,
        title: 'Test Document',
        author: 'John Doe',
        deleteAll: true,
      },
      expectedFormData: {
        fileInput: mockFile,
        title: 'Test Document',
        author: 'John Doe',
        deleteAll: 'true',
      },
    },
    {
      name: 'should handle empty string values',
      params: defaultParams,
      expectedFormData: {
        title: '',
        author: '',
        subject: '',
        keywords: '',
        creator: '',
        producer: '',
        creationDate: '',
        modificationDate: '',
        trapped: TrappedStatus.UNKNOWN,
        deleteAll: 'false',
      },
    },
    {
      name: 'should include all standard metadata fields',
      params: {
        ...defaultParams,
        title: 'Test Title',
        author: 'Test Author',
        subject: 'Test Subject',
        keywords: 'test, keywords',
        creator: 'Test Creator',
        producer: 'Test Producer',
        creationDate: new Date('2025/01/17 14:30:00'),
        modificationDate: new Date('2025/01/17 15:30:00'),
        trapped: TrappedStatus.TRUE,
      },
      expectedFormData: {
        title: 'Test Title',
        author: 'Test Author',
        subject: 'Test Subject',
        keywords: 'test, keywords',
        creator: 'Test Creator',
        producer: 'Test Producer',
        creationDate: '2025/01/17 14:30:00',
        modificationDate: '2025/01/17 15:30:00',
        trapped: TrappedStatus.TRUE,
      },
    },
  ])('$name', ({ params, expectedFormData }) => {
    const formData = buildChangeMetadataFormData(params, mockFile);

    Object.entries(expectedFormData).forEach(([key, value]) => {
      expect(formData.get(key)).toBe(value);
    });
  });

  test('should handle custom metadata with proper indexing', () => {
    const params = {
      ...defaultParams,
      customMetadata: [
        { key: 'Department', value: 'Engineering', id: 'custom1' },
        { key: 'Project', value: 'Test Project', id: 'custom2' },
        { key: 'Status', value: 'Draft', id: 'custom3' },
      ],
    };

    const formData = buildChangeMetadataFormData(params, mockFile);

    expect(formData.get('allRequestParams[customKey1]')).toBe('Department');
    expect(formData.get('allRequestParams[customValue1]')).toBe('Engineering');
    expect(formData.get('allRequestParams[customKey2]')).toBe('Project');
    expect(formData.get('allRequestParams[customValue2]')).toBe('Test Project');
    expect(formData.get('allRequestParams[customKey3]')).toBe('Status');
    expect(formData.get('allRequestParams[customValue3]')).toBe('Draft');
  });

  test('should skip custom metadata with empty keys or values', () => {
    const params = {
      ...defaultParams,
      customMetadata: [
        { key: 'Department', value: 'Engineering', id: 'custom1' },
        { key: '', value: 'No Key', id: 'custom2' },
        { key: 'No Value', value: '', id: 'custom3' },
        { key: '   ', value: 'Whitespace Key', id: 'custom4' },
        { key: 'Valid', value: 'Valid Value', id: 'custom5' },
      ],
    };

    const formData = buildChangeMetadataFormData(params, mockFile);

    expect(formData.get('allRequestParams[customKey1]')).toBe('Department');
    expect(formData.get('allRequestParams[customValue1]')).toBe('Engineering');
    expect(formData.get('allRequestParams[customKey2]')).toBe('Valid');
    expect(formData.get('allRequestParams[customValue2]')).toBe('Valid Value');
    expect(formData.get('allRequestParams[customKey3]')).toBeNull();
    expect(formData.get('allRequestParams[customKey4]')).toBeNull();
  });

  test('should trim whitespace from custom metadata', () => {
    const params = {
      ...defaultParams,
      customMetadata: [
        { key: '  Department  ', value: '  Engineering  ', id: 'custom1' },
      ],
    };

    const formData = buildChangeMetadataFormData(params, mockFile);

    expect(formData.get('allRequestParams[customKey1]')).toBe('Department');
    expect(formData.get('allRequestParams[customValue1]')).toBe('Engineering');
  });
});
