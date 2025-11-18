import type { LicenseNotice } from '@app/components/onboarding/slides/types';

export interface InitialOnboardingModalProps {
  opened: boolean;
  onClose: () => void;
  onRequestServerLicense?: (options?: { deferUntilTourComplete?: boolean; selfReportedAdmin?: boolean }) => void;
  onLicenseNoticeUpdate?: (licenseNotice: LicenseNotice) => void;
}

export interface OnboardingState {
  step: number;
  selectedDownloadIcon: 'new' | 'classic';
  selectedRole: 'admin' | 'user' | null;
  selfReportedAdmin: boolean;
}

export const DEFAULT_STATE: OnboardingState = {
  step: 0,
  selectedDownloadIcon: 'new',
  selectedRole: null,
  selfReportedAdmin: false,
};

