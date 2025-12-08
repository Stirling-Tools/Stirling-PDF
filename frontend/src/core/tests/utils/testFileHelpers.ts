/**
 * Test utilities for creating StirlingFile objects in tests
 */

import { StirlingFile, createStirlingFile } from '@app/types/fileContext';

/**
 * Create a StirlingFile object for testing purposes
 */
export function createTestStirlingFile(
  name: string,
  content: string = 'test content',
  type: string = 'application/pdf'
): StirlingFile {
  const file = new File([content], name, { type });
  return createStirlingFile(file);
}

/**
 * Create multiple StirlingFile objects for testing
 */
export function createTestFilesWithId(
  files: Array<{ name: string; content?: string; type?: string }>
): StirlingFile[] {
  return files.map(({ name, content = 'test content', type = 'application/pdf' }) =>
    createTestStirlingFile(name, content, type)
  );
}