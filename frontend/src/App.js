import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ColorSchemeScript, MantineProvider } from '@mantine/core';
import './index.css';
import HomePage from './pages/HomePage';
import SplitPdfPanel from './tools/Split';
import reportWebVitals from './reportWebVitals';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/split" element={<SplitPdfPanel />} />
    </Routes>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
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
