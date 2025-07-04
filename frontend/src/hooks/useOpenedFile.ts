import { useState, useEffect } from 'react';
import { fileOpenService } from '../services/fileOpenService';

export function useOpenedFile() {
  const [openedFilePath, setOpenedFilePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkForOpenedFile = async () => {
      try {
        const filePath = await fileOpenService.getOpenedFile();
        
        if (filePath) {
          console.log('✅ App opened with file:', filePath);
          setOpenedFilePath(filePath);
        } 

      } catch (error) {
        console.error('❌ Failed to check for opened file:', error);
      } finally {
        setLoading(false);
      }
    };

    checkForOpenedFile();
  }, []);

  return { openedFilePath, loading };
}