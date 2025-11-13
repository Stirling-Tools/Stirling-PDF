import { invoke, isTauri } from '@tauri-apps/api/core';

export interface FileOpenService {
  getOpenedFiles(): Promise<string[]>;
  readFileAsArrayBuffer(filePath: string): Promise<{ fileName: string; arrayBuffer: ArrayBuffer } | null>;
  clearOpenedFiles(): Promise<void>;
  onFileOpened(callback: (filePath: string) => void): () => void; // Returns unlisten function
}

class TauriFileOpenService implements FileOpenService {
  async getOpenedFiles(): Promise<string[]> {
    try {
      console.log('🔍 Calling invoke(get_opened_files)...');
      const result = await invoke<string[]>('get_opened_files');
      console.log('🔍 invoke(get_opened_files) returned:', result);
      return result;
    } catch (error) {
      console.error('❌ Failed to get opened files:', error);
      return [];
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

  async clearOpenedFiles(): Promise<void> {
    try {
      console.log('🔍 Calling invoke(clear_opened_files)...');
      await invoke('clear_opened_files');
      console.log('✅ Successfully cleared opened files');
    } catch (error) {
      console.error('❌ Failed to clear opened files:', error);
    }
  }

  onFileOpened(callback: (filePath: string) => void): () => void {
    let cleanup: (() => void) | null = null;
    let isCleanedUp = false;

    const setupEventListeners = async () => {
      try {
        // Check if already cleaned up before async setup completes
        if (isCleanedUp) {
          return;
        }

        // Only import if in Tauri environment
        if (isTauri()) {
          const { listen } = await import('@tauri-apps/api/event');

          // Check again after async import
          if (isCleanedUp) {
            return;
          }

          // Listen for unified file open events (all platforms)
          const unlisten = await listen('file-opened', (event) => {
            console.log('📂 File open event received:', event.payload);
            callback(event.payload as string);
          });

          // Set up cleanup function only if not already cleaned up
          if (!isCleanedUp) {
            cleanup = () => {
              try {
                unlisten();
                console.log('✅ File event listeners cleaned up');
              } catch (error) {
                console.error('❌ Error during file event cleanup:', error);
              }
            };
          } else {
            // Clean up immediately if cleanup was called during setup
            try {
              unlisten();
            } catch (error) {
              console.error('❌ Error during immediate cleanup:', error);
            }
          }
        }
      } catch (error) {
        console.error('❌ Failed to setup file event listeners:', error);
      }
    };

    setupEventListeners();

    // Return cleanup function
    return () => {
      isCleanedUp = true;
      if (cleanup) {
        cleanup();
      }
    };
  }
}

class WebFileOpenService implements FileOpenService {
  async getOpenedFiles(): Promise<string[]> {
    // In web mode, there's no file association support
    return [];
  }

  async readFileAsArrayBuffer(_filePath: string): Promise<{ fileName: string; arrayBuffer: ArrayBuffer } | null> {
    // In web mode, cannot read arbitrary file paths
    return null;
  }

  async clearOpenedFiles(): Promise<void> {
    // In web mode, no file clearing needed
  }

  onFileOpened(_callback: (filePath: string) => void): () => void {
    // In web mode, no file events - return no-op cleanup function
    console.log('ℹ️ Web mode: File event listeners not supported');
    return () => {
      // No-op cleanup for web mode
    };
  }
}

// Export the appropriate service based on environment
export const fileOpenService: FileOpenService = isTauri()
  ? new TauriFileOpenService()
  : new WebFileOpenService();
