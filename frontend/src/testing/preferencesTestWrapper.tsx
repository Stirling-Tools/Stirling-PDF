import React from 'react';
import { PreferencesProvider } from '@app/contexts/PreferencesContext';

export const PreferencesTestWrapper = ({ children }: { children: React.ReactNode }) => (
  <PreferencesProvider>{children}</PreferencesProvider>
);
