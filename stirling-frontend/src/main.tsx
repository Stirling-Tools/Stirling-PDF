import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

import './tokens/tokens.css';
import './tokens/base.css';

const root = document.getElementById('root');
if (!root) throw new Error('No #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
