import type { LicenseNotice } from '@app/types/types';

export interface InitialOnboardingModalProps {
  opened: boolean;
  onClose: () => void;
  onRequestServerLicense?: (options?: { deferUntilTourComplete?: boolean; selfReportedAdmin?: boolean }) => void;
  onLicenseNoticeUpdate?: (licenseNotice: LicenseNotice) => void;
}

export interface OnboardingState {
  step: number;
  selectedRole: 'admin' | 'user' | null;
  selfReportedAdmin: boolean;
}

export const DEFAULT_STATE: OnboardingState = {
  step: 0,
  selectedRole: null,
  selfReportedAdmin: false,
};

