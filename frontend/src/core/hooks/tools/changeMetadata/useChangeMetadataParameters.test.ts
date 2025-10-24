import { renderHook, act } from '@testing-library/react';
import { defaultParameters, useChangeMetadataParameters } from '@app/hooks/tools/changeMetadata/useChangeMetadataParameters';
import { TrappedStatus } from '@app/types/metadata';
import { describe, expect, test } from 'vitest';

describe('useChangeMetadataParameters', () => {
  test('should initialize with default parameters', () => {
    const { result } = renderHook(() => useChangeMetadataParameters());

    expect(result.current.parameters).toStrictEqual(defaultParameters);
  });

  describe('parameter updates', () => {
    test.each([
      { paramName: 'title', value: 'Test Document' },
      { paramName: 'author', value: 'John Doe' },
      { paramName: 'subject', value: 'Test Subject' },
      { paramName: 'keywords', value: 'test, metadata' },
      { paramName: 'creator', value: 'Test Creator' },
      { paramName: 'producer', value: 'Test Producer' },
      { paramName: 'creationDate', value: new Date('2025/01/17 14:30:00') },
      { paramName: 'modificationDate', value: new Date('2025/01/17 15:30:00') },
      { paramName: 'trapped', value: TrappedStatus.TRUE },
      { paramName: 'deleteAll', value: true },
    ] as const)('should update $paramName parameter', ({ paramName, value }) => {
      const { result } = renderHook(() => useChangeMetadataParameters());

      act(() => {
        result.current.updateParameter(paramName, value);
      });

      expect(result.current.parameters[paramName]).toBe(value);
    });
  });

  describe('validation', () => {
    test.each([
      { description: 'deleteAll is true', updates: { deleteAll: true }, expected: true },
      { description: 'has title', updates: { title: 'Test Document' }, expected: true },
      { description: 'has author', updates: { author: 'John Doe' }, expected: true },
      { description: 'has subject', updates: { subject: 'Test Subject' }, expected: true },
      { description: 'has keywords', updates: { keywords: 'test' }, expected: true },
      { description: 'has creator', updates: { creator: 'Test Creator' }, expected: true },
      { description: 'has producer', updates: { producer: 'Test Producer' }, expected: true },
      { description: 'has creation date', updates: { creationDate: new Date('2025/01/17 14:30:00') }, expected: true },
      { description: 'has modification date', updates: { modificationDate: new Date('2025/01/17 14:30:00') }, expected: true },
      { description: 'has trapped status', updates: { trapped: TrappedStatus.TRUE }, expected: true },
      { description: 'no meaningful content', updates: {}, expected: false },
      { description: 'whitespace only', updates: { title: '   ', author: '   ' }, expected: false },
    ])('should validate correctly when $description', ({ updates, expected }) => {
      const { result } = renderHook(() => useChangeMetadataParameters());

      act(() => {
        Object.entries(updates).forEach(([key, value]) => {
          result.current.updateParameter(key as keyof typeof updates, value);
        });
      });

      expect(result.current.validateParameters()).toBe(expected);
    });

    test.each([
      { description: 'valid creation date', updates: { title: 'Test', creationDate: new Date('2025/01/17 14:30:00') }, expected: true },
      { description: 'valid modification date', updates: { title: 'Test', modificationDate: new Date('2025/01/17 14:30:00') }, expected: true },
      { description: 'empty dates are valid', updates: { title: 'Test', creationDate: null, modificationDate: null }, expected: true },
    ])('should validate dates correctly with $description', ({ updates, expected }) => {
      const { result } = renderHook(() => useChangeMetadataParameters());

      act(() => {
        Object.entries(updates).forEach(([key, value]) => {
          result.current.updateParameter(key as keyof typeof updates, value);
        });
      });

      expect(result.current.validateParameters()).toBe(expected);
    });
  });

  describe('custom metadata', () => {
    test('should add custom metadata with sequential IDs', () => {
      const { result } = renderHook(() => useChangeMetadataParameters());

      act(() => {
        result.current.addCustomMetadata();
      });

      expect(result.current.parameters.customMetadata).toHaveLength(1);
      expect(result.current.parameters.customMetadata[0]).toEqual({
        key: '',
        value: '',
        id: expect.stringMatching(/^custom\d+$/)
      });
    });

    test('should remove custom metadata by ID', () => {
      const { result } = renderHook(() => useChangeMetadataParameters());

      act(() => {
        result.current.addCustomMetadata();
      });

      const customId = result.current.parameters.customMetadata[0].id;

      act(() => {
        result.current.removeCustomMetadata(customId);
      });

      expect(result.current.parameters.customMetadata).toHaveLength(0);
    });

    test('should update custom metadata by ID', () => {
      const { result } = renderHook(() => useChangeMetadataParameters());

      act(() => {
        result.current.addCustomMetadata();
      });

      const customId = result.current.parameters.customMetadata[0].id;

      act(() => {
        result.current.updateCustomMetadata(customId, 'Department', 'Engineering');
      });

      expect(result.current.parameters.customMetadata[0]).toEqual({
        key: 'Department',
        value: 'Engineering',
        id: customId
      });
    });

    test('should validate with custom metadata', () => {
      const { result } = renderHook(() => useChangeMetadataParameters());

      act(() => {
        result.current.addCustomMetadata();
      });

      const customId = result.current.parameters.customMetadata[0].id;

      act(() => {
        result.current.updateCustomMetadata(customId, 'Department', 'Engineering');
      });

      expect(result.current.validateParameters()).toBe(true);
    });

    test('should generate unique IDs for multiple custom entries', () => {
      const { result } = renderHook(() => useChangeMetadataParameters());

      for (let i = 0; i < 3; i++) {
        act(() => {
          result.current.addCustomMetadata();
        });
      }

      const ids = result.current.parameters.customMetadata.map(entry => entry.id);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3); // All unique
      expect(ids.every(id => id.startsWith('custom'))).toBe(true);
    });
  });

  test('should return correct endpoint name', () => {
    const { result } = renderHook(() => useChangeMetadataParameters());

    expect(result.current.getEndpointName()).toBe('update-metadata');
  });
});
