/**
 * Onboarding Side-Effect Hooks
 * 
 * These hooks handle side effects that the main Onboarding component needs
 * but don't belong in the render logic:
 * - Upgrade banner session blocking
 * - Cookie consent step completion
 * - Server license request handling (from UpgradeBanner "See info" click)
 * - Tour request handling (from QuickAccessBar help menu)
 */

import { useEffect, useCallback, useState } from 'react';
import {
  ONBOARDING_SESSION_BLOCK_KEY,
  ONBOARDING_SESSION_EVENT,
  SERVER_LICENSE_REQUEST_EVENT,
  START_TOUR_EVENT,
  type ServerLicenseRequestPayload,
  type TourType,
  type StartTourPayload,
} from '@app/constants/events';
import type { OnboardingRuntimeState } from '@app/components/onboarding/orchestrator/onboardingConfig';

/**
 * Manages the session storage flag that blocks the UpgradeBanner
 * while onboarding is in progress.
 */
export function useUpgradeBannerBlock(onboardingFullyComplete: boolean) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.sessionStorage.setItem(
      ONBOARDING_SESSION_BLOCK_KEY,
      onboardingFullyComplete ? 'false' : 'true'
    );
    window.dispatchEvent(new CustomEvent(ONBOARDING_SESSION_EVENT));
  }, [onboardingFullyComplete]);
}

/**
 * Listens for SERVER_LICENSE_REQUEST_EVENT (from UpgradeBanner "See info" click)
 * and returns state for showing the server license slide externally.
 */
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

/**
 * Listens for START_TOUR_EVENT (from QuickAccessBar help menu)
 * and returns state for starting a tour externally.
 */
export function useTourRequest(): {
  tourRequested: boolean;
  requestedTourType: TourType;
  clearTourRequest: () => void;
} {
  const [tourRequested, setTourRequested] = useState(false);
  const [requestedTourType, setRequestedTourType] = useState<TourType>('tools');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleTourRequest = (event: Event) => {
      const { detail } = event as CustomEvent<StartTourPayload>;
      setRequestedTourType(detail?.tourType ?? 'tools');
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
