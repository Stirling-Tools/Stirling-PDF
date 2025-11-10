import React from 'react';

interface OnboardingStepperProps {
  totalSteps: number;
  activeStep: number; // 0-indexed
  className?: string;
}

/**
 * Renders a progress indicator where the active step is a pill and others are dots.
 * Colors come from theme.css variables.
 */
export function OnboardingStepper({ totalSteps, activeStep, className }: OnboardingStepperProps) {
  const items = Array.from({ length: totalSteps }, (_, index) => index);

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {items.map((index) => {
        const isActive = index === activeStep;
        const baseStyles: React.CSSProperties = {
          background: isActive
            ? 'var(--onboarding-step-active)'
            : 'var(--onboarding-step-inactive)',
        };

        return (
          <div
            key={index}
            style={{
              ...baseStyles,
              width: isActive ? 44 : 8,
              height: 8,
              borderRadius: 9999,
            }}
          />
        );
      })}
    </div>
  );
}

export default OnboardingStepper;


