import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePreferences } from './PreferencesContext';

interface OnboardingContextValue {
  isOpen: boolean;
  currentStep: number;
  setCurrentStep: (step: number) => void;
  startTour: () => void;
  closeTour: () => void;
  completeTour: () => void;
  resetTour: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { preferences, updatePreference, isLoading } = usePreferences();
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // Auto-start tour for first-time users after preferences load
  useEffect(() => {
    if (!isLoading && !preferences.hasCompletedOnboarding) {
      // Small delay to ensure UI is rendered
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, preferences.hasCompletedOnboarding]);

  const startTour = useCallback(() => {
    setCurrentStep(0);
    setIsOpen(true);
  }, []);

  const closeTour = useCallback(() => {
    setIsOpen(false);
  }, []);

  const completeTour = useCallback(async () => {
    setIsOpen(false);
    await updatePreference('hasCompletedOnboarding', true);
  }, [updatePreference]);

  const resetTour = useCallback(async () => {
    await updatePreference('hasCompletedOnboarding', false);
    setCurrentStep(0);
    setIsOpen(true);
  }, [updatePreference]);

  return (
    <OnboardingContext.Provider
      value={{
        isOpen,
        currentStep,
        setCurrentStep,
        startTour,
        closeTour,
        completeTour,
        resetTour,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = (): OnboardingContextValue => {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
};
