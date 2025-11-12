import { useState, useEffect } from 'react';
import { fileOpenService } from '@app/services/fileOpenService';

export function useOpenedFile() {
  const [openedFilePaths, setOpenedFilePaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkForOpenedFile = async () => {
      console.log('🔍 Checking for opened file(s)...');
      try {
        const filePaths = await fileOpenService.getOpenedFiles();
        console.log('🔍 fileOpenService.getOpenedFiles() returned:', filePaths);

        if (filePaths.length > 0) {
          console.log(`✅ App opened with ${filePaths.length} file(s):`, filePaths);
          setOpenedFilePaths(filePaths);

          // Clear the files from service state after consuming them
          await fileOpenService.clearOpenedFiles();
        } else {
          console.log('ℹ️ No files were opened with the app');
        }

      } catch (error) {
        console.error('❌ Failed to check for opened files:', error);
      } finally {
        setLoading(false);
      }
    };

    checkForOpenedFile();

    // Listen for runtime file open events (abstracted through service)
    const unlistenRuntimeEvents = fileOpenService.onFileOpened((filePath: string) => {
      console.log('📂 Runtime file open event:', filePath);
      setOpenedFilePaths(prev => [...prev, filePath]);
    });

    // Cleanup function
    return () => {
      unlistenRuntimeEvents();
    };
  }, []);

  return { openedFilePaths, loading };
}
