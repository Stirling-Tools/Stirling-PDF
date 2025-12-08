import { useState, useEffect } from 'react';
import { fileOpenService } from '@app/services/fileOpenService';
import { listen } from '@tauri-apps/api/event';

export function useOpenedFile() {
  const [openedFilePaths, setOpenedFilePaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Function to read and process files from storage
    const readFilesFromStorage = async () => {
      console.log('🔍 Reading files from storage...');
      try {
        const filePaths = await fileOpenService.getOpenedFiles();
        console.log('🔍 fileOpenService.getOpenedFiles() returned:', filePaths);

        if (filePaths.length > 0) {
          console.log(`✅ Found ${filePaths.length} file(s) in storage:`, filePaths);
          setOpenedFilePaths(filePaths);
          await fileOpenService.clearOpenedFiles();
        }
      } catch (error) {
        console.error('❌ Failed to read files from storage:', error);
      } finally {
        setLoading(false);
      }
    };

    // Read files on mount
    readFilesFromStorage();

    // Listen for files-changed events (when new files are added to storage)
    let unlisten: (() => void) | undefined;
    listen('files-changed', async () => {
      console.log('📂 files-changed event received, re-reading storage...');
      await readFilesFromStorage();
    }).then(unlistenFn => {
      unlisten = unlistenFn;
    });

    // Cleanup function
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return { openedFilePaths, loading };
}
