import React from 'react';
import { RainbowThemeProvider } from './components/RainbowThemeProvider';
import HomePage from './pages/HomePage';

// Import global styles
import './styles/tailwind.css';
import './index.css';

export default function App() {
  return (
    <RainbowThemeProvider>
      <HomePage />
    </RainbowThemeProvider>
  );
}
