import '@mantine/core/styles.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';


const root = ReactDOM.createRoot(document.getElementById('root')); // Finds the root DOM element
root.render(
  <React.StrictMode>
    <ColorSchemeScript />
    <MantineProvider withGlobalStyles withNormalizeCSS>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MantineProvider>
  </React.StrictMode>
);

reportWebVitals();
