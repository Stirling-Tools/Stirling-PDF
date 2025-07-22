import { invoke } from '@tauri-apps/api/core';

export interface FileOpenService {
  getOpenedFile(): Promise<string | null>;
  readFileAsArrayBuffer(filePath: string): Promise<{ fileName: string; arrayBuffer: ArrayBuffer } | null>;
  clearOpenedFile(): Promise<void>;
  onFileOpened(callback: (filePath: string) => void): () => void; // Returns unlisten function
}

class TauriFileOpenService implements FileOpenService {
  async getOpenedFile(): Promise<string | null> {
    try {
      console.log('🔍 Calling invoke(get_opened_file)...');
      const result = await invoke<string | null>('get_opened_file');
      console.log('🔍 invoke(get_opened_file) returned:', result);
      return result;
    } catch (error) {
      console.error('❌ Failed to get opened file:', error);
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

  async clearOpenedFile(): Promise<void> {
    try {
      console.log('🔍 Calling invoke(clear_opened_file)...');
      await invoke('clear_opened_file');
      console.log('✅ Successfully cleared opened file');
    } catch (error) {
      console.error('❌ Failed to clear opened file:', error);
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
        if (typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)) {
          const { listen } = await import('@tauri-apps/api/event');
          
          // Check again after async import
          if (isCleanedUp) {
            return;
          }
          
          // Listen for macOS native file open events
          const unlistenMacOS = await listen('macos://open-file', (event) => {
            console.log('📂 macOS native file open event:', event.payload);
            callback(event.payload as string);
          });
          
          // Listen for fallback file open events
          const unlistenFallback = await listen('file-opened', (event) => {
            console.log('📂 Fallback file open event:', event.payload);
            callback(event.payload as string);
          });
          
          // Set up cleanup function only if not already cleaned up
          if (!isCleanedUp) {
            cleanup = () => {
              try {
                unlistenMacOS();
                unlistenFallback();
                console.log('✅ File event listeners cleaned up');
              } catch (error) {
                console.error('❌ Error during file event cleanup:', error);
              }
            };
          } else {
            // Clean up immediately if cleanup was called during setup
            try {
              unlistenMacOS();
              unlistenFallback();
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
  async getOpenedFile(): Promise<string | null> {
    // In web mode, there's no file association support
    return null;
  }

  async readFileAsArrayBuffer(filePath: string): Promise<{ fileName: string; arrayBuffer: ArrayBuffer } | null> {
    // In web mode, cannot read arbitrary file paths
    return null;
  }

  async clearOpenedFile(): Promise<void> {
    // In web mode, no file clearing needed
  }

  onFileOpened(callback: (filePath: string) => void): () => void {
    // In web mode, no file events - return no-op cleanup function
    console.log('ℹ️ Web mode: File event listeners not supported');
    return () => {
      // No-op cleanup for web mode
    };
  }
}

// Export the appropriate service based on environment
export const fileOpenService: FileOpenService = 
  typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)
    ? new TauriFileOpenService()
    : new WebFileOpenService();