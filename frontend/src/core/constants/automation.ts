/**
 * Constants for automation functionality
 */

export const AUTOMATION_CONSTANTS = {
  // Timeouts
  OPERATION_TIMEOUT: 300000, // 5 minutes in milliseconds
  
  // Default values
  DEFAULT_TOOL_COUNT: 2,
  MIN_TOOL_COUNT: 2,
  
  // File prefixes
  FILE_PREFIX: 'automated_',
  RESPONSE_ZIP_PREFIX: 'response_',
  RESULT_FILE_PREFIX: 'result_',
  PROCESSED_FILE_PREFIX: 'processed_',
  
  // Operation types
  CONVERT_OPERATION_TYPE: 'convert',
  
  // Storage keys
  DB_NAME: 'StirlingPDF_Automations',
  DB_VERSION: 1,
  STORE_NAME: 'automations',
  
  // UI delays
  SPINNER_ANIMATION_DURATION: '1s'
} as const;

export const AUTOMATION_STEPS = {
  SELECTION: 'selection',
  CREATION: 'creation',
  RUN: 'run'
} as const;

export const EXECUTION_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  ERROR: 'error'
} as const;