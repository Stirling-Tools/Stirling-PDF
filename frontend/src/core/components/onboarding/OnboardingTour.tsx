/**
 * OnboardingTour Component
 * 
 * Reusable tour wrapper that encapsulates all Reactour configuration.
 * Used by the main Onboarding component for both the 'tour' step and
 * when the tour is open but onboarding is inactive.
 */

import React from 'react';
import { TourProvider, useTour, type StepType } from '@reactour/tour';
import { CloseButton, ActionIcon } from '@mantine/core';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckIcon from '@mui/icons-material/Check';
import type { TFunction } from 'i18next';
import i18n from '@app/i18n';

/**
 * TourContent - Controls the tour visibility
 * Syncs the forceOpen prop with the reactour tour state.
 */
function TourContent({ forceOpen = false }: { forceOpen?: boolean }) {
  const { setIsOpen, setCurrentStep } = useTour();
  const previousIsOpenRef = React.useRef(forceOpen);

  React.useEffect(() => {
    const wasClosedNowOpen = !previousIsOpenRef.current && forceOpen;
    previousIsOpenRef.current = forceOpen;

    if (wasClosedNowOpen) {
      setCurrentStep(0);
    }
    setIsOpen(forceOpen);
  }, [forceOpen, setIsOpen, setCurrentStep]);

  return null;
}

interface AdvanceArgs {
  setCurrentStep: (value: number | ((prev: number) => number)) => void;
  currentStep: number;
  steps?: StepType[];
  setIsOpen: (value: boolean) => void;
}

interface CloseArgs {
  setIsOpen: (value: boolean) => void;
}

interface OnboardingTourProps {
  tourSteps: StepType[];
  tourType: 'admin' | 'tools';
  isRTL: boolean;
  t: TFunction;
  isOpen: boolean;
  onAdvance: (args: AdvanceArgs) => void;
  onClose: (args: CloseArgs) => void;
}

export default function OnboardingTour({
  tourSteps,
  tourType,
  isRTL,
  t,
  isOpen,
  onAdvance,
  onClose,
}: OnboardingTourProps) {
  if (!isOpen) return null;

  return (
    <TourProvider
      key={`${tourType}-${i18n.language}`}
      steps={tourSteps}
      maskClassName={tourType === 'admin' ? 'admin-tour-mask' : undefined}
      onClickClose={onClose}
      onClickMask={onAdvance}
      onClickHighlighted={(e, clickProps) => {
        e.stopPropagation();
        onAdvance(clickProps);
      }}
      keyboardHandler={(e, clickProps, status) => {
        if (e.key === 'ArrowRight' && !status?.isRightDisabled && clickProps) {
          e.preventDefault();
          onAdvance(clickProps);
        } else if (e.key === 'Escape' && !status?.isEscDisabled && clickProps) {
          e.preventDefault();
          onClose(clickProps);
        }
      }}
      rtl={isRTL}
      styles={{
        popover: (base) => ({
          ...base,
          backgroundColor: 'var(--mantine-color-body)',
          color: 'var(--mantine-color-text)',
          borderRadius: '8px',
          padding: '20px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          maxWidth: '400px',
        }),
        maskArea: (base) => ({
          ...base,
          rx: 8,
        }),
        badge: (base) => ({
          ...base,
          backgroundColor: 'var(--mantine-primary-color-filled)',
        }),
        controls: (base) => ({
          ...base,
          justifyContent: 'center',
        }),
      }}
      highlightedMaskClassName="tour-highlight-glow"
      showNavigation={true}
      showBadge={false}
      showCloseButton={true}
      disableInteraction={true}
      disableDotsNavigation={false}
      prevButton={() => null}
      nextButton={({ currentStep: tourCurrentStep, stepsLength, setCurrentStep, setIsOpen }) => {
        const isLast = tourCurrentStep === stepsLength - 1;
        const ArrowIcon = isRTL ? ArrowBackIcon : ArrowForwardIcon;
        return (
          <ActionIcon
            onClick={() => onAdvance({ setCurrentStep, currentStep: tourCurrentStep, steps: tourSteps, setIsOpen })}
            variant="subtle"
            size="lg"
            aria-label={isLast ? t('onboarding.finish', 'Finish') : t('onboarding.next', 'Next')}
          >
            {isLast ? <CheckIcon /> : <ArrowIcon />}
          </ActionIcon>
        );
      }}
      components={{
        Close: ({ onClick }) => (
          <CloseButton onClick={onClick} size="md" style={{ position: 'absolute', top: '8px', right: '8px' }} />
        ),
        Content: ({ content }: { content: string }) => (
          <div style={{ paddingRight: '16px' }} dangerouslySetInnerHTML={{ __html: content }} />
        ),
      }}
    >
      <TourContent forceOpen={true} />
    </TourProvider>
  );
}

export type { AdvanceArgs, CloseArgs };

