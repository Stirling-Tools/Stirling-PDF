import React, { Suspense } from 'react';
import { RainbowThemeProvider } from './components/shared/RainbowThemeProvider';
import { FileContextProvider } from './contexts/FileContext';
import { NavigationProvider } from './contexts/NavigationContext';
import { FilesModalProvider } from './contexts/FilesModalContext';
import HomePage from './pages/HomePage';

// Import global styles
import './styles/tailwind.css';
import './index.css';

// Loading component for i18next suspense
const LoadingFallback = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    fontSize: '18px',
    color: '#666'
  }}>
    Loading...
  </div>
);

export default function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <RainbowThemeProvider>
        <FileContextProvider enableUrlSync={true} enablePersistence={true}>
        <NavigationProvider>
            <FilesModalProvider>
              <HomePage />
            </FilesModalProvider>
        </NavigationProvider>
        </FileContextProvider>
      </RainbowThemeProvider>
    </Suspense>
  );
}
