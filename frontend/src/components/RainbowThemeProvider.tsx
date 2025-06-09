import React, { createContext, useContext, ReactNode } from 'react';
import { MantineProvider, ColorSchemeScript } from '@mantine/core';
import { useRainbowTheme } from '../hooks/useRainbowTheme';
import { mantineTheme } from '../theme/mantineTheme';
import rainbowStyles from '../styles/rainbow.module.css';

interface RainbowThemeContextType {
  themeMode: 'light' | 'dark' | 'rainbow';
  isRainbowMode: boolean;
  isToggleDisabled: boolean;
  toggleTheme: () => void;
  activateRainbow: () => void;
  deactivateRainbow: () => void;
}

const RainbowThemeContext = createContext<RainbowThemeContextType | null>(null);

export function useRainbowThemeContext() {
  const context = useContext(RainbowThemeContext);
  if (!context) {
    throw new Error('useRainbowThemeContext must be used within RainbowThemeProvider');
  }
  return context;
}

interface RainbowThemeProviderProps {
  children: ReactNode;
}

export function RainbowThemeProvider({ children }: RainbowThemeProviderProps) {
  const rainbowTheme = useRainbowTheme();

  // Determine the Mantine color scheme
  const mantineColorScheme = rainbowTheme.themeMode === 'rainbow' ? 'dark' : rainbowTheme.themeMode;

  return (
    <>
      <ColorSchemeScript defaultColorScheme={mantineColorScheme} />
      <RainbowThemeContext.Provider value={rainbowTheme}>
        <MantineProvider
          theme={mantineTheme}
          defaultColorScheme={mantineColorScheme}
          forceColorScheme={mantineColorScheme}
        >
          <div
            className={rainbowTheme.isRainbowMode ? rainbowStyles.rainbowMode : ''}
            style={{ minHeight: '100vh' }}
          >
            {children}
          </div>
        </MantineProvider>
      </RainbowThemeContext.Provider>
    </>
  );
}
