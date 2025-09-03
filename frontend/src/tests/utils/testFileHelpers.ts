/**
 * Test utilities for creating FileWithId objects in tests
 */

import { FileWithId, createFileWithId } from '../../types/fileContext';

/**
 * Create a FileWithId object for testing purposes
 */
export function createTestFileWithId(
  name: string,
  content: string = 'test content',
  type: string = 'application/pdf'
): FileWithId {
  const file = new File([content], name, { type });
  return createFileWithId(file);
}

/**
 * Create multiple FileWithId objects for testing
 */
export function createTestFilesWithId(
  files: Array<{ name: string; content?: string; type?: string }>
): FileWithId[] {
  return files.map(({ name, content = 'test content', type = 'application/pdf' }) =>
    createTestFileWithId(name, content, type)
  );
}