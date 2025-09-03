/**
 * Runtime validation utilities for FileId safety
 */

import { FileId } from '../types/fileContext';

// Validate that a string is a proper FileId (has UUID format)
export function isValidFileId(id: string): id is FileId {
  // Check UUID v4 format: 8-4-4-4-12 hex digits
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

// Detect potentially dangerous file.name usage as ID
export function isDangerousFileNameAsId(fileName: string, context: string = ''): boolean {
  // Check if it's definitely a UUID (safe)
  if (isValidFileId(fileName)) {
    return false;
  }
  
  // Check if it's a quickKey (safe) - format: name|size|lastModified
  if (/^.+\|\d+\|\d+$/.test(fileName)) {
    return false; // quickKeys are legitimate, not dangerous
  }
  
  // Common patterns that suggest file.name is being used as ID
  const dangerousPatterns = [
    /^[^-]+-page-\d+$/, // pattern: filename-page-123
    /\.(pdf|jpg|png|doc|docx)$/i, // ends with file extension
    /\s/, // contains whitespace (filenames often have spaces)
    /[()[\]{}]/, // contains brackets/parentheses common in filenames
    /['"]/, // contains quotes
    /[^a-zA-Z0-9\-._]/ // contains special characters not in UUIDs
  ];
  
  // Check dangerous patterns
  const isDangerous = dangerousPatterns.some(pattern => pattern.test(fileName));
  
  if (isDangerous && context) {
    console.warn(`⚠️ Potentially dangerous file.name usage detected in ${context}: "${fileName}"`);
  }
  
  return isDangerous;
}

// Runtime validation for FileId usage in development
export function validateFileId(id: string, context: string): void {
  if (process.env.NODE_ENV === 'development') {
    // Check if it looks like a dangerous file.name usage
    if (isDangerousFileNameAsId(id, context)) {
      console.error(`💀 DANGEROUS: file.name used as FileId in ${context}! This will cause ID collisions.`);
      console.trace('Stack trace:');
    }
  }
}

// Runtime validation for File vs FileWithId usage
export function validateFileWithId(file: File, context: string): void {
  // Check if file has embedded fileId
  if (!('fileId' in file)) {
    console.warn(`⚠️ Regular File object used where FileWithId expected in ${context}: "${file.name}"`);
    console.warn('Consider using FileWithId for better type safety');
  }
}

// Assertion for FileId validation (throws in development)
export function assertValidFileId(id: string, context: string): void {
  if (process.env.NODE_ENV === 'development') {
    if (isDangerousFileNameAsId(id, context)) {
      throw new Error(`ASSERTION FAILED: Dangerous file.name as FileId detected in ${context}: "${id}"`);
    }
  }
}

// Global debug helpers (can be enabled in dev tools)
if (typeof window !== 'undefined') {
  window.__FILE_ID_DEBUG = process.env.NODE_ENV === 'development';
  window.__validateFileId = validateFileId;
}