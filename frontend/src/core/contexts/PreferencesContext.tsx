import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { preferencesService, UserPreferences, PREFERENCES_STORAGE_KEY } from '@app/services/preferencesService';
import { addLocalSettingsListener } from '@app/utils/localSettingsEvents';

interface PreferencesContextValue {
  preferences: UserPreferences;
  updatePreference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => void;
  resetPreferences: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    // Load preferences synchronously on mount
    return preferencesService.getAllPreferences();
  });

  useEffect(() => {
    return addLocalSettingsListener(detail => {
      if (detail.origin !== 'remote') {
        return;
      }
      if (detail.keys.includes(PREFERENCES_STORAGE_KEY)) {
        setPreferences(preferencesService.getAllPreferences());
      }
    });
  }, []);

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

  return (
    <PreferencesContext.Provider
      value={{
        preferences,
        updatePreference,
        resetPreferences,
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
