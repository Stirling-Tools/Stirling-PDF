/**
 * Runtime validation utilities for FileId safety
 */

import { FileId } from '@app/types/fileContext';

// Validate that a string is a proper FileId (has UUID format)
export function isValidFileId(id: string): id is FileId {
  // Check UUID v4 format: 8-4-4-4-12 hex digits
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}


