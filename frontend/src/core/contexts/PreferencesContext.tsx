import React, { createContext, useContext, useState, useCallback } from 'react';
import { preferencesService, UserPreferences } from '@app/services/preferencesService';

interface PreferencesContextValue {
  preferences: UserPreferences;
  updatePreference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => void;
  resetPreferences: () => void;
  updateServerDefaults: (defaults: Partial<UserPreferences>) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

export const PreferencesProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    // Load preferences synchronously on mount with hardcoded defaults
    return preferencesService.getAllPreferences();
  });

  const updatePreference = useCallback(
    <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
      preferencesService.setPreference(key, value);
      setPreferences((prev) => ({
        ...prev,
        [key]: value,
      }));
    },
    []
  );

  const resetPreferences = useCallback(() => {
    preferencesService.clearAllPreferences();
    setPreferences(preferencesService.getAllPreferences());
  }, []);

  const updateServerDefaults = useCallback((defaults: Partial<UserPreferences>) => {
    preferencesService.setServerDefaults(defaults);
    // Reload preferences to apply server defaults
    setPreferences(preferencesService.getAllPreferences());
  }, []);

  return (
    <PreferencesContext.Provider
      value={{
        preferences,
        updatePreference,
        resetPreferences,
        updateServerDefaults,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
};

export const usePreferences = (): PreferencesContextValue => {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
};
