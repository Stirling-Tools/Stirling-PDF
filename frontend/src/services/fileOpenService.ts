import { invoke } from '@tauri-apps/api/core';

export interface FileOpenService {
  getOpenedFile(): Promise<string | null>;
  readFileAsArrayBuffer(filePath: string): Promise<{ fileName: string; arrayBuffer: ArrayBuffer } | null>;
}

class TauriFileOpenService implements FileOpenService {
  async getOpenedFile(): Promise<string | null> {
    try {
      const result = await invoke<string | null>('get_opened_file');
      return result;
    } catch (error) {
      console.error('Failed to get opened file:', error);
      return null;
    }
  }

  async readFileAsArrayBuffer(filePath: string): Promise<{ fileName: string; arrayBuffer: ArrayBuffer } | null> {
    try {
      const { readFile } = await import('@tauri-apps/plugin-fs');
      
      const fileData = await readFile(filePath);
      const fileName = filePath.split(/[\\/]/).pop() || 'opened-file.pdf';
      
      return {
        fileName,
        arrayBuffer: fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength)
      };
    } catch (error) {
      console.error('Failed to read file:', error);
      return null;
    }
  }
}

class WebFileOpenService implements FileOpenService {
  async getOpenedFile(): Promise<string | null> {
    // In web mode, there's no file association support
    return null;
  }

  async readFileAsArrayBuffer(filePath: string): Promise<{ fileName: string; arrayBuffer: ArrayBuffer } | null> {
    // In web mode, cannot read arbitrary file paths
    return null;
  }
}

// Export the appropriate service based on environment
export const fileOpenService: FileOpenService = 
  typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)
    ? new TauriFileOpenService()
    : new WebFileOpenService();