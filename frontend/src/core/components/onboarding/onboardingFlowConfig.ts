import WelcomeSlide from '@app/components/onboarding/slides/WelcomeSlide';
import DesktopInstallSlide from '@app/components/onboarding/slides/DesktopInstallSlide';
import SecurityCheckSlide from '@app/components/onboarding/slides/SecurityCheckSlide';
import PlanOverviewSlide from '@app/components/onboarding/slides/PlanOverviewSlide';
import ServerLicenseSlide from '@app/components/onboarding/slides/ServerLicenseSlide';
import FirstLoginSlide from '@app/components/onboarding/slides/FirstLoginSlide';
import TourOverviewSlide from '@app/components/onboarding/slides/TourOverviewSlide';
import AnalyticsChoiceSlide from '@app/components/onboarding/slides/AnalyticsChoiceSlide';
import { SlideConfig, LicenseNotice } from '@app/types/types';

export type SlideId =
  | 'first-login'
  | 'welcome'
  | 'desktop-install'
  | 'security-check'
  | 'admin-overview'
  | 'server-license'
  | 'tour-overview'
  | 'analytics-choice';

export type HeroType = 'rocket' | 'dual-icon' | 'shield' | 'diamond' | 'logo' | 'lock' | 'analytics';

export type ButtonAction =
  | 'next'
  | 'prev'
  | 'close'
  | 'complete-close'
  | 'download-selected'
  | 'security-next'
  | 'launch-admin'
  | 'launch-tools'
  | 'launch-auto'
  | 'see-plans'
  | 'skip-to-license'
  | 'skip-tour'
  | 'enable-analytics'
  | 'disable-analytics';

export interface FlowState {
  selectedRole: 'admin' | 'user' | null;
}

export interface OSOption {
  label: string;
  url: string;
  value: string;
}

export interface SlideFactoryParams {
  osLabel: string;
  osUrl: string;
  osOptions?: OSOption[];
  onDownloadUrlChange?: (url: string) => void;
  selectedRole: 'admin' | 'user' | null;
  onRoleSelect: (role: 'admin' | 'user' | null) => void;
  licenseNotice?: LicenseNotice;
  loginEnabled?: boolean;
  // First login params
  firstLoginUsername?: string;
  onPasswordChanged?: () => void;
  usingDefaultCredentials?: boolean;
  mfaRequired?: boolean;
  analyticsError?: string | null;
  analyticsLoading?: boolean;
}

export interface HeroDefinition {
  type: HeroType;
}

export interface ButtonDefinition {
  key: string;
  type: 'button' | 'icon';
  label?: string;
  icon?: 'chevron-left';
  variant?: 'primary' | 'secondary' | 'default';
  group: 'left' | 'right';
  action: ButtonAction;
  disabledWhen?: (state: FlowState) => boolean;
}

export interface SlideDefinition {
  id: SlideId;
  createSlide: (params: SlideFactoryParams) => SlideConfig;
  hero: HeroDefinition;
  buttons: ButtonDefinition[];
}

export const SLIDE_DEFINITIONS: Record<SlideId, SlideDefinition> = {
  'first-login': {
    id: 'first-login',
    createSlide: ({ firstLoginUsername, onPasswordChanged, usingDefaultCredentials, mfaRequired }) =>
      FirstLoginSlide({
        username: firstLoginUsername || '',
        onPasswordChanged: onPasswordChanged || (() => {}),
        usingDefaultCredentials: usingDefaultCredentials || false,
        mfaRequired: mfaRequired || false,
      }),
    hero: { type: 'lock' },
    buttons: [], // Form has its own submit button
  },
  'welcome': {
    id: 'welcome',
    createSlide: () => WelcomeSlide(),
    hero: { type: 'rocket' },
    buttons: [
      {
        key: 'welcome-next',
        type: 'button',
        label: 'onboarding.buttons.next',
        variant: 'primary',
        group: 'right',
        action: 'next',
      },
    ],
  },
  'desktop-install': {
    id: 'desktop-install',
    createSlide: ({ osLabel, osUrl, osOptions, onDownloadUrlChange }) => DesktopInstallSlide({ osLabel, osUrl, osOptions, onDownloadUrlChange }),
    hero: { type: 'dual-icon' },
    buttons: [
      {
        key: 'desktop-back',
        type: 'icon',
        icon: 'chevron-left',
        group: 'left',
        action: 'prev',
      },
      {
        key: 'desktop-skip',
        type: 'button',
        label: 'onboarding.buttons.skipForNow',
        variant: 'secondary',
        group: 'left',
        action: 'next',
      },
      {
        key: 'desktop-download',
        type: 'button',
        label: 'onboarding.buttons.download',
        variant: 'primary',
        group: 'right',
        action: 'download-selected',
      },
    ],
  },
  'security-check': {
    id: 'security-check',
    createSlide: ({ selectedRole, onRoleSelect }) =>
      SecurityCheckSlide({ selectedRole, onRoleSelect }),
    hero: { type: 'shield' },
    buttons: [
      {
        key: 'security-back',
        type: 'button',
        label: 'onboarding.buttons.back',
        variant: 'secondary',
        group: 'left',
        action: 'prev',
      },
      {
        key: 'security-next',
        type: 'button',
        label: 'onboarding.buttons.next',
        variant: 'primary',
        group: 'right',
        action: 'security-next',
        disabledWhen: (state) => !state.selectedRole,
      },
    ],
  },
  'admin-overview': {
    id: 'admin-overview',
    createSlide: ({ licenseNotice, loginEnabled }) =>
      PlanOverviewSlide({ isAdmin: true, licenseNotice, loginEnabled }),
    hero: { type: 'diamond' },
    buttons: [
      {
        key: 'admin-back',
        type: 'icon',
        icon: 'chevron-left',
        group: 'left',
        action: 'prev',
      },
      {
        key: 'admin-show',
        type: 'button',
        label: 'onboarding.buttons.showMeAround',
        variant: 'primary',
        group: 'right',
        action: 'launch-admin',
      },
      {
        key: 'admin-skip',
        type: 'button',
        label: 'onboarding.buttons.skipTheTour',
        variant: 'secondary',
        group: 'left',
        action: 'skip-to-license',
      },
    ],
  },
  'server-license': {
    id: 'server-license',
    createSlide: ({ licenseNotice }) => ServerLicenseSlide({ licenseNotice }),
    hero: { type: 'dual-icon' },
    buttons: [
      {
        key: 'license-back',
        type: 'icon',
        icon: 'chevron-left',
        group: 'left',
        action: 'prev',
      },
      {
        key: 'license-close',
        type: 'button',
        label: 'onboarding.buttons.skipForNow',
        variant: 'secondary',
        group: 'left',
        action: 'close',
      },
      {
        key: 'license-see-plans',
        type: 'button',
        label: 'onboarding.serverLicense.seePlans',
        variant: 'primary',
        group: 'right',
        action: 'see-plans',
      },
    ],
  },
  'tour-overview': {
    id: 'tour-overview',
    createSlide: () => TourOverviewSlide(),
    hero: { type: 'rocket' },
    buttons: [
      {
        key: 'tour-overview-back',
        type: 'icon',
        icon: 'chevron-left',
        group: 'left',
        action: 'prev',
      },
      {
        key: 'tour-overview-skip',
        type: 'button',
        label: 'onboarding.buttons.skipForNow',
        variant: 'secondary',
        group: 'left',
        action: 'skip-tour',
      },
      {
        key: 'tour-overview-show',
        type: 'button',
        label: 'onboarding.buttons.showMeAround',
        variant: 'primary',
        group: 'right',
        action: 'launch-tools',
      },
    ],
  },
  'analytics-choice': {
    id: 'analytics-choice',
    createSlide: ({ analyticsError }) => AnalyticsChoiceSlide({ analyticsError }),
    hero: { type: 'analytics' },
    buttons: [
      {
        key: 'analytics-disable',
        type: 'button',
        label: 'no',
        variant: 'secondary',
        group: 'left',
        action: 'disable-analytics',
      },
      {
        key: 'analytics-enable',
        type: 'button',
        label: 'yes',
        variant: 'primary',
        group: 'right',
        action: 'enable-analytics',
      },
    ],
  },
};

