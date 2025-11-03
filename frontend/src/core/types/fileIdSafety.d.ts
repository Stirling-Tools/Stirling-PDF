/**
 * Type safety declarations to prevent file.name/UUID confusion
 */

import { FileId, StirlingFile } from '@app/types/fileContext';

declare global {
  namespace FileIdSafety {
    // Mark functions that should never accept file.name as parameters
    type SafeFileIdFunction<T extends (...args: any[]) => any> = T extends (...args: infer P) => infer _R
      ? P extends readonly [string, ...any[]]
        ? never // Reject string parameters in first position for FileId functions
        : T
      : T;

    // Mark functions that should only accept StirlingFile, not regular File
    type StirlingFileOnlyFunction<T extends (...args: any[]) => any> = T extends (...args: infer P) => infer _R
      ? P extends readonly [File, ...any[]]
        ? never // Reject File parameters in first position for StirlingFile functions
        : T
      : T;

    // Utility type to enforce StirlingFile usage
    type RequireStirlingFile<T> = T extends File ? StirlingFile : T;
  }

  // Extend Window interface for debugging
  interface Window {
    __FILE_ID_DEBUG?: boolean;
  }
}

// Augment FileContext types to prevent bypassing StirlingFile
declare module '../contexts/FileContext' {
  export interface StrictFileContextActions {
    pinFile: (file: StirlingFile) => void; // Must be StirlingFile
    unpinFile: (file: StirlingFile) => void; // Must be StirlingFile
    addFiles: (files: File[], options?: { insertAfterPageId?: string }) => Promise<StirlingFile[]>; // Returns StirlingFile
    consumeFiles: (inputFileIds: FileId[], outputFiles: File[]) => Promise<StirlingFile[]>; // Returns StirlingFile
  }

  export interface StrictFileContextSelectors {
    getFile: (id: FileId) => StirlingFile | undefined; // Returns StirlingFile
    getFiles: (ids?: FileId[]) => StirlingFile[]; // Returns StirlingFile[]
    isFilePinned: (file: StirlingFile) => boolean; // Must be StirlingFile
  }
}

export {};
