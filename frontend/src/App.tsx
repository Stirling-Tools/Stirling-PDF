import React from 'react';
import { MantineProvider } from '@mantine/core';
import { mantineTheme } from './theme/mantineTheme';
import HomePage from './pages/HomePage';

// Import global styles
import './styles/theme.css';
import './styles/tailwind.css';
import './styles/components.css';
import './index.css';

export default function App() {
  return (
    <MantineProvider theme={mantineTheme}>
      <HomePage />
    </MantineProvider>
  );
}
