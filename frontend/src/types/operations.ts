/**
 * Typed operation model with discriminated unions
 * Centralizes all PDF operations with proper type safety
 */

import { FileId } from './fileContext';

export type OperationId = string;

export type OperationStatus = 
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'canceled';

// Base operation interface
export interface BaseOperation {
  id: OperationId;
  type: string;
  status: OperationStatus;
  progress: number;
  error?: string | null;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  abortController?: AbortController;
}

// Split operations
export type SplitMode = 
  | 'pages'
  | 'size' 
  | 'duplicates'
  | 'bookmarks'
  | 'sections';

export interface SplitPagesParams {
  mode: 'pages';
  pages: number[];
}

export interface SplitSizeParams {
  mode: 'size';
  maxSizeBytes: number;
}

export interface SplitDuplicatesParams {
  mode: 'duplicates';
  tolerance?: number;
}

export interface SplitBookmarksParams {
  mode: 'bookmarks';
  level?: number;
}

export interface SplitSectionsParams {
  mode: 'sections';
  sectionCount: number;
}

export type SplitParams = 
  | SplitPagesParams
  | SplitSizeParams
  | SplitDuplicatesParams
  | SplitBookmarksParams
  | SplitSectionsParams;

export interface SplitOperation extends BaseOperation {
  type: 'split';
  inputFileId: FileId;
  params: SplitParams;
  outputFileIds?: FileId[];
}

// Merge operations
export interface MergeOperation extends BaseOperation {
  type: 'merge';
  inputFileIds: FileId[];
  params: {
    sortBy?: 'name' | 'size' | 'date' | 'custom';
    customOrder?: FileId[];
    bookmarks?: boolean;
  };
  outputFileId?: FileId;
}

// Compress operations
export interface CompressOperation extends BaseOperation {
  type: 'compress';
  inputFileId: FileId;
  params: {
    level: 'low' | 'medium' | 'high' | 'extreme';
    imageQuality?: number; // 0-100
    grayscale?: boolean;
    removeAnnotations?: boolean;
  };
  outputFileId?: FileId;
}

// Convert operations
export type ConvertFormat = 
  | 'pdf'
  | 'docx' 
  | 'pptx'
  | 'xlsx'
  | 'html'
  | 'txt'
  | 'jpg'
  | 'png';

export interface ConvertOperation extends BaseOperation {
  type: 'convert';
  inputFileIds: FileId[];
  params: {
    targetFormat: ConvertFormat;
    imageSettings?: {
      quality?: number;
      dpi?: number;
      colorSpace?: 'rgb' | 'grayscale' | 'cmyk';
    };
    pdfSettings?: {
      pdfStandard?: 'PDF/A-1' | 'PDF/A-2' | 'PDF/A-3';
      compliance?: boolean;
    };
  };
  outputFileIds?: FileId[];
}

// OCR operations
export interface OcrOperation extends BaseOperation {
  type: 'ocr';
  inputFileId: FileId;
  params: {
    languages: string[];
    mode: 'searchable' | 'text-only' | 'overlay';
    preprocess?: boolean;
    deskew?: boolean;
  };
  outputFileId?: FileId;
}

// Security operations
export interface SecurityOperation extends BaseOperation {
  type: 'security';
  inputFileId: FileId;
  params: {
    action: 'encrypt' | 'decrypt' | 'sign' | 'watermark';
    password?: string;
    permissions?: {
      printing?: boolean;
      copying?: boolean;
      editing?: boolean;
      annotations?: boolean;
    };
    watermark?: {
      text: string;
      position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
      opacity: number;
    };
  };
  outputFileId?: FileId;
}

// Union type for all operations
export type Operation = 
  | SplitOperation
  | MergeOperation
  | CompressOperation
  | ConvertOperation
  | OcrOperation
  | SecurityOperation;

// Operation state management
export interface OperationState {
  operations: Record<OperationId, Operation>;
  queue: OperationId[];
  active: OperationId[];
  history: OperationId[];
}

// Operation creation helpers
export function createOperationId(): OperationId {
  return `op-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

export function createBaseOperation(type: string): BaseOperation {
  return {
    id: createOperationId(),
    type,
    status: 'idle',
    progress: 0,
    error: null,
    createdAt: Date.now(),
    abortController: new AbortController()
  };
}

// Type guards for operations
export function isSplitOperation(op: Operation): op is SplitOperation {
  return op.type === 'split';
}

export function isMergeOperation(op: Operation): op is MergeOperation {
  return op.type === 'merge';
}

export function isCompressOperation(op: Operation): op is CompressOperation {
  return op.type === 'compress';
}

export function isConvertOperation(op: Operation): op is ConvertOperation {
  return op.type === 'convert';
}

export function isOcrOperation(op: Operation): op is OcrOperation {
  return op.type === 'ocr';
}

export function isSecurityOperation(op: Operation): op is SecurityOperation {
  return op.type === 'security';
}

// Operation status helpers
export function isOperationActive(op: Operation): boolean {
  return ['preparing', 'uploading', 'processing'].includes(op.status);
}

export function isOperationComplete(op: Operation): boolean {
  return op.status === 'completed';
}

export function isOperationFailed(op: Operation): boolean {
  return op.status === 'failed';
}

export function canRetryOperation(op: Operation): boolean {
  return op.status === 'failed' && !!op.abortController && !op.abortController.signal.aborted;
}

// Operation validation
export function validateSplitParams(params: SplitParams): string | null {
  switch (params.mode) {
    case 'pages':
      if (!params.pages.length) return 'No pages specified';
      if (params.pages.some(p => p < 1)) return 'Invalid page numbers';
      break;
    case 'size':
      if (params.maxSizeBytes <= 0) return 'Invalid size limit';
      break;
    case 'sections':
      if (params.sectionCount < 2) return 'Section count must be at least 2';
      break;
  }
  return null;
}

export function validateMergeParams(params: MergeOperation['params'], fileIds: FileId[]): string | null {
  if (fileIds.length < 2) return 'At least 2 files required for merge';
  if (params.sortBy === 'custom' && !params.customOrder?.length) {
    return 'Custom order required when sort by custom is selected';
  }
  return null;
}

export function validateCompressParams(params: CompressOperation['params']): string | null {
  if (params.imageQuality !== undefined && (params.imageQuality < 0 || params.imageQuality > 100)) {
    return 'Image quality must be between 0-100';
  }
  return null;
}

// Operation result types
export interface OperationResult {
  operationId: OperationId;
  success: boolean;
  outputFileIds: FileId[];
  error?: string;
  metadata?: Record<string, unknown>;
}

// Operation events for pub/sub
export type OperationEvent = 
  | { type: 'operation:created'; operation: Operation }
  | { type: 'operation:started'; operationId: OperationId }
  | { type: 'operation:progress'; operationId: OperationId; progress: number }
  | { type: 'operation:completed'; operationId: OperationId; result: OperationResult }
  | { type: 'operation:failed'; operationId: OperationId; error: string }
  | { type: 'operation:canceled'; operationId: OperationId };