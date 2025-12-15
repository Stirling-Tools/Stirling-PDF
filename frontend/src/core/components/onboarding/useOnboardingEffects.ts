import { useEffect, useCallback, useState } from 'react';
import {
  SERVER_LICENSE_REQUEST_EVENT,
  START_TOUR_EVENT,
  type ServerLicenseRequestPayload,
  type TourType,
  type StartTourPayload,
} from '@app/constants/events';
import type { OnboardingRuntimeState } from '@app/components/onboarding/orchestrator/onboardingConfig';

export function useServerLicenseRequest(): {
  showLicenseSlide: boolean;
  licenseNotice: OnboardingRuntimeState['licenseNotice'] | null;
  closeLicenseSlide: () => void;
} {
  const [showLicenseSlide, setShowLicenseSlide] = useState(false);
  const [licenseNotice, setLicenseNotice] = useState<OnboardingRuntimeState['licenseNotice'] | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleLicenseRequest = (event: Event) => {
      const { detail } = event as CustomEvent<ServerLicenseRequestPayload>;
      
      if (detail?.licenseNotice) {
        setLicenseNotice({
          totalUsers: detail.licenseNotice.totalUsers ?? null,
          freeTierLimit: detail.licenseNotice.freeTierLimit ?? 5,
          isOverLimit: detail.licenseNotice.isOverLimit ?? false,
          requiresLicense: true,
        });
      }
      
      setShowLicenseSlide(true);
    };

    window.addEventListener(SERVER_LICENSE_REQUEST_EVENT, handleLicenseRequest);
    return () => window.removeEventListener(SERVER_LICENSE_REQUEST_EVENT, handleLicenseRequest);
  }, []);

  const closeLicenseSlide = useCallback(() => {
    setShowLicenseSlide(false);
  }, []);

  return { showLicenseSlide, licenseNotice, closeLicenseSlide };
}

export function useTourRequest(): {
  tourRequested: boolean;
  requestedTourType: TourType;
  clearTourRequest: () => void;
} {
  const [tourRequested, setTourRequested] = useState(false);
  const [requestedTourType, setRequestedTourType] = useState<TourType>('whatsnew');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleTourRequest = (event: Event) => {
      const { detail } = event as CustomEvent<StartTourPayload>;
      setRequestedTourType(detail?.tourType ?? 'whatsnew');
      setTourRequested(true);
    };

    window.addEventListener(START_TOUR_EVENT, handleTourRequest);
    return () => window.removeEventListener(START_TOUR_EVENT, handleTourRequest);
  }, []);

  const clearTourRequest = useCallback(() => {
    setTourRequested(false);
  }, []);

  return { tourRequested, requestedTourType, clearTourRequest };
}
