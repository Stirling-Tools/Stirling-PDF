import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePreferences } from '@app/contexts/PreferencesContext';
import { useShouldShowWelcomeModal } from '@app/hooks/useShouldShowWelcomeModal';

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
  const { updatePreference } = usePreferences();
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const shouldShow = useShouldShowWelcomeModal();

  // Auto-show welcome modal for first-time users
  useEffect(() => {
    if (shouldShow) {
      setShowWelcomeModal(true);
    }
  }, [shouldShow]);

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
