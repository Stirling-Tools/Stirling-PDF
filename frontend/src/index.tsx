import '@mantine/core/styles.css';
import '../vite-env.d.ts';
import './index.css'; // Import Tailwind CSS
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ColorSchemeScript } from '@mantine/core';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './i18n'; // Initialize i18next
import { PostHogProvider } from 'posthog-js/react';

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
    <PostHogProvider
      apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
      options={{
        api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
        defaults: '2025-05-24',
        capture_exceptions: true, // This enables capturing exceptions using Error Tracking, set to false if you don't want this
        debug: import.meta.env.MODE === 'development',
      }}
    >
    <BrowserRouter>
      <App />
    </BrowserRouter>
    </PostHogProvider>
  </React.StrictMode>
);

