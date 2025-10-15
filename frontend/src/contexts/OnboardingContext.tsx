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
  const { preferences, updatePreference } = usePreferences();
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // Auto-start tour for first-time users after preferences load
  // Only show tour after user has seen the tool panel mode prompt
  useEffect(() => {
    if (!preferences.hasCompletedOnboarding && preferences.toolPanelModePromptSeen) {
      // Small delay to ensure UI is rendered
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [preferences.hasCompletedOnboarding, preferences.toolPanelModePromptSeen]);

  const startTour = useCallback(() => {
    setCurrentStep(0);
    setIsOpen(true);
  }, []);

  const closeTour = useCallback(() => {
    setIsOpen(false);
  }, []);

  const completeTour = useCallback(() => {
    setIsOpen(false);
    updatePreference('hasCompletedOnboarding', true);
  }, [updatePreference]);

  const resetTour = useCallback(() => {
    updatePreference('hasCompletedOnboarding', false);
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
