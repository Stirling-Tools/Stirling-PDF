import React, { createContext, useContext, useState, useCallback } from 'react';
import { usePreferences } from '@app/contexts/PreferencesContext';

export type TourType = 'tools' | 'admin';

export interface StartTourOptions {
  source?: string;
  skipToolPromptRequirement?: boolean;
  metadata?: Record<string, unknown>;
}

interface PendingTourRequest {
  type: TourType;
  source?: string;
  metadata?: Record<string, unknown>;
  requestedAt: number;
}

interface OnboardingContextValue {
  isOpen: boolean;
  currentStep: number;
  tourType: TourType;
  setCurrentStep: (step: number) => void;
  startTour: (type?: TourType, options?: StartTourOptions) => void;
  closeTour: () => void;
  completeTour: () => void;
  resetTour: (type?: TourType) => void;
  startAfterToolModeSelection: boolean;
  setStartAfterToolModeSelection: (value: boolean) => void;
  pendingTourRequest: PendingTourRequest | null;
  clearPendingTourRequest: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { preferences, updatePreference } = usePreferences();
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [tourType, setTourType] = useState<TourType>('tools');
  const [startAfterToolModeSelection, setStartAfterToolModeSelection] = useState(false);
  const [pendingTourRequest, setPendingTourRequest] = useState<PendingTourRequest | null>(null);

  const openTour = useCallback((type: TourType = 'tools') => {
    setTourType(type);
    setCurrentStep(0);
    setIsOpen(true);
  }, []);

  const startTour = useCallback(
    (type: TourType = 'tools', options?: StartTourOptions) => {
      const requestedType = type ?? 'tools';
      const source = options?.source ?? 'unspecified';
      const metadata = options?.metadata;
      const skipToolPromptRequirement = options?.skipToolPromptRequirement ?? false;
      const toolPromptSeen = preferences.toolPanelModePromptSeen;
      const hasSelectedToolPanelMode = preferences.hasSelectedToolPanelMode;
      const hasToolPreference = toolPromptSeen || hasSelectedToolPanelMode;
      const shouldDefer = !skipToolPromptRequirement && !hasToolPreference;

      console.log('[onboarding] startTour invoked', {
        requestedType,
        source,
        toolPromptSeen,
        hasSelectedToolPanelMode,
        shouldDefer,
        hasPendingTourRequest: !!pendingTourRequest,
        metadata,
      });

      if (shouldDefer) {
        setPendingTourRequest({
          type: requestedType,
          source,
          metadata,
          requestedAt: Date.now(),
        });
        setStartAfterToolModeSelection(true);
        console.log('[onboarding] deferring tour launch until tool panel mode selection completes', {
          requestedType,
          source,
        });
        return;
      }

      if (pendingTourRequest) {
        console.log('[onboarding] clearing previous pending tour request before starting new tour', {
          previousRequest: pendingTourRequest,
          newType: requestedType,
          source,
        });
      }

      setPendingTourRequest(null);
      setStartAfterToolModeSelection(false);
      console.log('[onboarding] starting tour', {
        requestedType,
        source,
      });
      openTour(requestedType);
    },
    [openTour, pendingTourRequest, preferences.toolPanelModePromptSeen, preferences.hasSelectedToolPanelMode],
  );

  const closeTour = useCallback(() => {
    setIsOpen(false);
  }, []);

  const completeTour = useCallback(() => {
    setIsOpen(false);
    updatePreference('hasCompletedOnboarding', true);
  }, [updatePreference]);

  const resetTour = useCallback((type: TourType = 'tools') => {
    updatePreference('hasCompletedOnboarding', false);
    setTourType(type);
    setCurrentStep(0);
    setIsOpen(true);
  }, [updatePreference]);

  const clearPendingTourRequest = useCallback(() => {
    if (pendingTourRequest) {
      console.log('[onboarding] clearing pending tour request manually', {
        pendingTourRequest,
      });
    }
    setPendingTourRequest(null);
    setStartAfterToolModeSelection(false);
  }, [pendingTourRequest]);

  return (
    <OnboardingContext.Provider
      value={{
        isOpen,
        currentStep,
        tourType,
        setCurrentStep,
        startTour,
        closeTour,
        completeTour,
        resetTour,
        startAfterToolModeSelection,
        setStartAfterToolModeSelection,
        pendingTourRequest,
        clearPendingTourRequest,
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
