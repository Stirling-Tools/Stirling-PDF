import React from 'react';
import { useTour } from '@reactour/tour';

interface TourContentProps {
  /** Whether the tour should be open */
  forceOpen?: boolean;
}

/**
 * TourContent - Controls the tour visibility
 * 
 * This component syncs the forceOpen prop with the reactour tour state.
 */
export default function TourContent({ forceOpen = false }: TourContentProps) {
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

