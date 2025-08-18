import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { RainbowThemeProvider } from './components/shared/RainbowThemeProvider';
import { FileContextProvider } from './contexts/FileContext';
import { FilesModalProvider } from './contexts/FilesModalContext';
import { AuthProvider } from './lib/useSession';
import HomePage from './pages/HomePage';
import LoginCompact from './routes/LoginCompact';
import Signup from './routes/Signup';
import AuthCallback from './routes/AuthCallback';
import AuthDebug from './routes/AuthDebug';

// Import global styles
import './styles/tailwind.css';
import './index.css';

export default function App() {
  return (
    <RainbowThemeProvider>
      <AuthProvider>
        <FileContextProvider enableUrlSync={true} enablePersistence={true}>
          <FilesModalProvider>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginCompact />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/debug" element={<AuthDebug />} />
              {/* Catch-all route - redirects unknown paths to home */}
              <Route path="*" element={<HomePage />} />
            </Routes>
          </FilesModalProvider>
        </FileContextProvider>
      </AuthProvider>
    </RainbowThemeProvider>
  );
}
