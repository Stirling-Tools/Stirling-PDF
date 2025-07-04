import React from 'react';
import { RainbowThemeProvider } from './components/shared/RainbowThemeProvider';
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
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow-sm border-b relative">
        <BackendHealthIndicator className="absolute top-3 left-3 z-10" />
        <div className="max-w-4xl mx-auto px-4 py-3">
         <h1 className="text-xl font-bold">Stirling PDF</h1>
        </div>
      </div>
      <RainbowThemeProvider>
        <HomePage openedFilePath={openedFilePath} />
      </RainbowThemeProvider>
    </div>
  );
}
