import React from 'react';
import { RainbowThemeProvider } from './components/shared/RainbowThemeProvider';
import { FileContextProvider } from './contexts/FileContext';
import HomePage from './pages/HomePage';
import { useOpenedFile } from './hooks/useOpenedFile';
import { useBackendInitializer } from './hooks/useBackendInitializer';

// Import global styles
import './styles/tailwind.css';
import './index.css';

import { BackendHealthIndicator } from './components/BackendHealthIndicator';

export default function App() {
  const { openedFilePath, loading: fileLoading } = useOpenedFile();
  
  // Initialize backend on app startup
  useBackendInitializer();
  return (
    <>
    <BackendHealthIndicator className="absolute top-3 left-3 z-10" />
    <RainbowThemeProvider>
      <FileContextProvider enableUrlSync={true} enablePersistence={true}>
        <HomePage />
      </FileContextProvider>
    </RainbowThemeProvider>
    </>
  );
}
