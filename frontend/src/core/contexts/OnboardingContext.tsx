import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePreferences } from '@app/contexts/PreferencesContext';
import { useMediaQuery } from '@mantine/hooks';
import { useAuth } from '@app/auth/UseSession';

interface OnboardingContextValue {
  isOpen: boolean;
  currentStep: number;
  setCurrentStep: (step: number) => void;
  startTour: () => void;
  closeTour: () => void;
  completeTour: () => void;
  resetTour: () => void;
  showWelcomeModal: boolean;
  setShowWelcomeModal: (show: boolean) => void;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { preferences, updatePreference } = usePreferences();
  const { session, loading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const isMobile = useMediaQuery("(max-width: 1024px)");

  // Auto-show welcome modal for first-time users after preferences load
  // Only show after user has seen the tool panel mode prompt
  // Also, don't show tour on mobile devices because it feels clunky
  // IMPORTANT: Only show welcome modal if user is authenticated or login is disabled
  useEffect(() => {
    if (!loading && !preferences.hasCompletedOnboarding && preferences.toolPanelModePromptSeen && !isMobile) {
      // Only show welcome modal if user is authenticated (session exists)
      // This prevents the modal from showing on login screens when security is enabled
      if (session) {
        setShowWelcomeModal(true);
      }
    }
  }, [preferences.hasCompletedOnboarding, preferences.toolPanelModePromptSeen, isMobile, session, loading]);

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
        showWelcomeModal,
        setShowWelcomeModal,
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
