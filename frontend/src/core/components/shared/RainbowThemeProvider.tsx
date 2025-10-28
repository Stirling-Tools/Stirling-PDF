import { createContext, useContext, ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import { useRainbowTheme } from '@app/hooks/useRainbowTheme';
import { mantineTheme } from '@app/theme/mantineTheme';
import rainbowStyles from '@app/styles/rainbow.module.css';
import { ToastProvider } from '@app/components/toast';
import ToastRenderer from '@app/components/toast/ToastRenderer';
import { ToastPortalBinder } from '@app/components/toast';
import type { ThemeMode } from '@app/constants/theme';

interface RainbowThemeContextType {
  themeMode: ThemeMode;
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
          <ToastProvider>
            <ToastPortalBinder />
            {children}
            <ToastRenderer />
          </ToastProvider>
        </div>
      </MantineProvider>
    </RainbowThemeContext.Provider>
  );
}
