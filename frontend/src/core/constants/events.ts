import type { LicenseNotice } from '@app/types/types';

export const SERVER_LICENSE_REQUEST_EVENT = 'stirling:server-license-requested';
export const UPGRADE_BANNER_TEST_EVENT = 'stirling:upgrade-banner-test';
export const UPGRADE_BANNER_ALERT_EVENT = 'stirling:upgrade-banner-alert';
export const START_TOUR_EVENT = 'stirling:start-tour';
export const TOUR_STATE_EVENT = 'stirling:tour-state';

export interface ServerLicenseRequestPayload {
  licenseNotice?: Partial<LicenseNotice>;
  deferUntilTourComplete?: boolean;
  selfReportedAdmin?: boolean;
}

export type UpgradeBannerTestScenario = 'friendly' | 'urgent-admin' | 'urgent-user' | null;

export interface UpgradeBannerTestPayload {
  scenario: UpgradeBannerTestScenario;
}

export interface UpgradeBannerAlertPayload {
  active: boolean;
  audience?: 'admin' | 'user';
  totalUsers?: number | null;
  freeTierLimit?: number;
}

export type TourType = 'admin' | 'tools' | 'whatsnew';

export interface StartTourPayload {
  tourType: TourType;
}

export interface TourStatePayload {
  isOpen: boolean;
}

/** Helper to dispatch the start tour event */
export function requestStartTour(tourType: TourType): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<StartTourPayload>(START_TOUR_EVENT, { detail: { tourType } })
  );
}

/** Helper to dispatch tour state changes (for hiding cookie consent during tour) */
export function dispatchTourState(isOpen: boolean): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<TourStatePayload>(TOUR_STATE_EVENT, { detail: { isOpen } })
  );
}

