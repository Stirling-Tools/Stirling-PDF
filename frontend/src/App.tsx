import React, { useState, useEffect } from 'react';
import { RainbowThemeProvider } from './components/shared/RainbowThemeProvider';
import { FileContextProvider } from './contexts/FileContext';
import HomePage from './pages/HomePage';
import { useOpenedFile } from './hooks/useOpenedFile';
import { useBackendInitializer } from './hooks/useBackendInitializer';
import { fileOpenService } from './services/fileOpenService';

// Import global styles
import './styles/tailwind.css';
import './index.css';

import { BackendHealthIndicator } from './components/BackendHealthIndicator';

export default function App() {
  
  // Initialize backend on app startup
  useBackendInitializer();
  
  // Handle file opened with app (Tauri mode)
  const { openedFilePath, loading: openedFileLoading } = useOpenedFile();
  const [openedFile, setOpenedFile] = useState<File | null>(null);

  // Load opened file once when path is available
  useEffect(() => {
    if (openedFilePath && !openedFileLoading) {
      const loadOpenedFile = async () => {
        try {
          const fileData = await fileOpenService.readFileAsArrayBuffer(openedFilePath);
          if (fileData) {
            // Create a File object from the ArrayBuffer
            const file = new File([fileData.arrayBuffer], fileData.fileName, {
              type: 'application/pdf'
            });
            setOpenedFile(file);
          }
        } catch (error) {
          console.error('Failed to load opened file:', error);
        }
      };
      
      loadOpenedFile();
    }
  }, [openedFilePath, openedFileLoading]);

  return (
    <>
    <BackendHealthIndicator className="absolute top-3 left-3 z-10" />
    <RainbowThemeProvider>
      <FileContextProvider enableUrlSync={true} enablePersistence={true}>
        <HomePage openedFile={openedFile} />
      </FileContextProvider>
    </RainbowThemeProvider>
    </>
  );
}
