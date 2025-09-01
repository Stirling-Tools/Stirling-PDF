/**
 * Runtime validation helpers for file ID safety
 */

import { isValidFileId, isDangerousFileNameAsId } from '../types/fileContext';

// Enable debug mode in development
const DEBUG_FILE_ID = process.env.NODE_ENV === 'development';

/**
 * Runtime validation for FileId usage
 */
export function validateFileIdUsage(id: string, context: string = ''): void {
  if (!DEBUG_FILE_ID) return;
  
  // Check if it's a valid UUID
  if (!isValidFileId(id)) {
    console.error(`🚨 Invalid FileId detected in ${context}: "${id}". Expected UUID format.`);
    
    // Check if it looks like a dangerous file.name usage
    if (isDangerousFileNameAsId(id, context)) {
      console.error(`💀 DANGEROUS: file.name used as FileId in ${context}! This will cause ID collisions.`);
      console.trace('Stack trace:');
    }
  }
}

/**
 * Runtime check for File vs FileWithId usage
 */
export function validateFileWithIdUsage(file: File, context: string = ''): void {
  if (!DEBUG_FILE_ID) return;
  
  // Check if file has embedded fileId
  if (!('fileId' in file)) {
    console.warn(`⚠️ Regular File object used where FileWithId expected in ${context}: "${file.name}"`);
    console.warn('Consider using FileWithId for better type safety');
  }
}

/**
 * Development-only assertion that fails on dangerous patterns
 */
export function assertSafeFileIdUsage(id: string, context: string = ''): void {
  if (process.env.NODE_ENV === 'development') {
    if (isDangerousFileNameAsId(id, context)) {
      throw new Error(`ASSERTION FAILED: Dangerous file.name as FileId detected in ${context}: "${id}"`);
    }
  }
}

/**
 * Install global runtime validators (development only)
 */
export function installFileIdSafetyValidators(): void {
  if (process.env.NODE_ENV !== 'development') return;
  
  // Add to window for debugging
  window.__FILE_ID_DEBUG = true;
  window.__validateFileId = validateFileIdUsage;
  
  // Monkey patch console.warn to highlight file ID issues
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    const message = args.join(' ');
    if (message.includes('file.name') && message.includes('ID')) {
      console.error('🚨 FILE ID SAFETY WARNING:', ...args);
      console.trace('Location:');
    } else {
      originalWarn.apply(console, args);
    }
  };
  
  console.log('🛡️ File ID safety validators installed (development mode)');
}

// Auto-install in development
if (process.env.NODE_ENV === 'development') {
  installFileIdSafetyValidators();
}