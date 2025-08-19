import '@mantine/core/styles.css';
import './index.css'; // Import Tailwind CSS
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ColorSchemeScript } from '@mantine/core';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './i18n'; // Initialize i18next

// Compute initial color scheme
function getInitialScheme(): 'light' | 'dark' {
  const stored = localStorage.getItem('stirling-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  try {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

const container = document.getElementById('root');
if (!container) {
  throw new Error("Root container missing in index.html");
}
const root = ReactDOM.createRoot(container); // Finds the root DOM element
root.render(
  <React.StrictMode>
    <ColorSchemeScript defaultColorScheme={getInitialScheme()} />
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

