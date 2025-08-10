import React from 'react';
import { RainbowThemeProvider } from './components/shared/RainbowThemeProvider';
import { FileContextProvider } from './contexts/FileContext';
import { FilesModalProvider } from './contexts/FilesModalContext';
import HomePage from './pages/HomePage';

// Import global styles
import './styles/tailwind.css';
import './index.css';

export default function App() {
  return (
    <RainbowThemeProvider>
      <FileContextProvider enableUrlSync={true} enablePersistence={true}>
        <FilesModalProvider>
          <HomePage />
        </FilesModalProvider>
      </FileContextProvider>
    </RainbowThemeProvider>
  );
}
