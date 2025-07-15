import { useState, useEffect } from 'react';
import { fileOpenService } from '../services/fileOpenService';

export function useOpenedFile() {
  const [openedFilePath, setOpenedFilePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkForOpenedFile = async () => {
      console.log('🔍 Checking for opened file...');
      try {
        const filePath = await fileOpenService.getOpenedFile();
        console.log('🔍 fileOpenService.getOpenedFile() returned:', filePath);
        
        if (filePath) {
          console.log('✅ App opened with file:', filePath);
          setOpenedFilePath(filePath);
          
          // Clear the file from service state after consuming it
          await fileOpenService.clearOpenedFile();
        } else {
          console.log('ℹ️ No file was opened with the app');
        }

      } catch (error) {
        console.error('❌ Failed to check for opened file:', error);
      } finally {
        setLoading(false);
      }
    };

    checkForOpenedFile();

    // Listen for runtime file open events (abstracted through service)
    const unlistenRuntimeEvents = fileOpenService.onFileOpened((filePath) => {
      console.log('📂 Runtime file open event:', filePath);
      setOpenedFilePath(filePath);
    });

    // Cleanup function
    return () => {
      unlistenRuntimeEvents();
    };
  }, []);

  return { openedFilePath, loading };
}