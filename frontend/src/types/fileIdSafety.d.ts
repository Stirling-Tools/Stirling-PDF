/**
 * Type safety declarations to prevent file.name/UUID confusion
 */

import { FileId, FileWithId, OperationType, FileOperation } from './fileContext';

declare global {
  namespace FileIdSafety {
    // Mark functions that should never accept file.name as parameters
    type SafeFileIdFunction<T extends (...args: any[]) => any> = T extends (...args: infer P) => infer R
      ? P extends readonly [string, ...any[]]
        ? never // Reject string parameters in first position for FileId functions
        : T
      : T;

    // Mark functions that should only accept FileWithId, not regular File
    type FileWithIdOnlyFunction<T extends (...args: any[]) => any> = T extends (...args: infer P) => infer R
      ? P extends readonly [File, ...any[]]
        ? never // Reject File parameters in first position for FileWithId functions
        : T
      : T;

    // Utility type to enforce FileWithId usage
    type RequireFileWithId<T> = T extends File ? FileWithId : T;
  }

  // Extend Window interface to add runtime validation helpers
  interface Window {
    __FILE_ID_DEBUG?: boolean;
    __validateFileId?: (id: string, context: string) => void;
  }
}

// Augment FileContext types to prevent bypassing FileWithId
declare module '../contexts/FileContext' {
  export interface StrictFileContextActions {
    pinFile: (file: FileWithId) => void; // Must be FileWithId
    unpinFile: (file: FileWithId) => void; // Must be FileWithId
    addFiles: (files: File[], options?: { insertAfterPageId?: string }) => Promise<FileWithId[]>; // Returns FileWithId
    consumeFiles: (inputFileIds: FileId[], outputFiles: File[]) => Promise<FileWithId[]>; // Returns FileWithId
  }
  
  export interface StrictFileContextSelectors {
    getFile: (id: FileId) => FileWithId | undefined; // Returns FileWithId
    getFiles: (ids?: FileId[]) => FileWithId[]; // Returns FileWithId[]
    isFilePinned: (file: FileWithId) => boolean; // Must be FileWithId
  }
}

export {};