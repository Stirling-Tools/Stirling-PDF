import '@mantine/core/styles.css';
import './index.css'; // Import Tailwind CSS
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './i18n'; // Initialize i18next


const container = document.getElementById('root');
if (!container) {
  throw new Error("Root container missing in index.html");
}
const root = ReactDOM.createRoot(container); // Finds the root DOM element
root.render(
  <React.StrictMode>
    <ColorSchemeScript />
    <MantineProvider defaultColorScheme="auto">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MantineProvider>
  </React.StrictMode>
);

