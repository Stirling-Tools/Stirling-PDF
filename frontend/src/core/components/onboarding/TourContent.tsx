import React from 'react';
import { useTour } from '@reactour/tour';
import { useOnboarding } from '@app/contexts/OnboardingContext';

export default function TourContent() {
  const { isOpen } = useOnboarding();
  const { setIsOpen, setCurrentStep } = useTour();
  const previousIsOpenRef = React.useRef(isOpen);

  React.useEffect(() => {
    const wasClosedNowOpen = !previousIsOpenRef.current && isOpen;
    previousIsOpenRef.current = isOpen;

    if (wasClosedNowOpen) {
      setCurrentStep(0);
    }
    setIsOpen(isOpen);
  }, [isOpen, setIsOpen, setCurrentStep]);

  return null;
}

