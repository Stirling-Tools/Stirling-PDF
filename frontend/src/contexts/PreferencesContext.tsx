import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { preferencesService, UserPreferences, DEFAULT_PREFERENCES } from '../services/preferencesService';

interface PreferencesContextValue {
  preferences: UserPreferences;
  updatePreference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => Promise<void>;
  resetPreferences: () => Promise<void>;
  isLoading: boolean;
}

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        await preferencesService.initialize();
        const loadedPreferences = await preferencesService.getAllPreferences();
        setPreferences(loadedPreferences);
      } catch (error) {
        console.error('Failed to load preferences:', error);
        // Keep default preferences on error
      } finally {
        setIsLoading(false);
      }
    };

    loadPreferences();
  }, []);

  const updatePreference = useCallback(
    async <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
        await preferencesService.setPreference(key, value);
        setPreferences((prev) => ({
          ...prev,
          [key]: value,
        }));
    },
    []
  );

  const resetPreferences = useCallback(async () => {
      await preferencesService.clearAllPreferences();
      setPreferences(DEFAULT_PREFERENCES);
  }, []);

  return (
    <PreferencesContext.Provider
      value={{
        preferences,
        updatePreference,
        resetPreferences,
        isLoading,
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
