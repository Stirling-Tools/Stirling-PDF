import WelcomeSlide from '@app/components/onboarding/slides/WelcomeSlide';
import DesktopInstallSlide from '@app/components/onboarding/slides/DesktopInstallSlide';
import SecurityCheckSlide from '@app/components/onboarding/slides/SecurityCheckSlide';
import PlanOverviewSlide from '@app/components/onboarding/slides/PlanOverviewSlide';
import ServerLicenseSlide from '@app/components/onboarding/slides/ServerLicenseSlide';
import { SlideConfig, LicenseNotice } from '@app/types/types';

export type SlideId =
  | 'welcome'
  | 'desktop-install'
  | 'security-check'
  | 'admin-overview'
  | 'server-license';

export type HeroType = 'rocket' | 'dual-icon' | 'shield' | 'diamond' | 'logo';

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
  | 'skip-to-license';

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
  'welcome': {
    id: 'welcome',
    createSlide: () => WelcomeSlide(),
    hero: { type: 'rocket' },
    buttons: [
      {
        key: 'welcome-next',
        type: 'button',
        label: 'Next →',
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
        label: 'Skip for now',
        variant: 'secondary',
        group: 'left',
        action: 'next',
      },
      {
        key: 'desktop-download',
        type: 'button',
        label: 'Download →',
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
        label: 'Back',
        variant: 'secondary',
        group: 'left',
        action: 'prev',
      },
      {
        key: 'security-next',
        type: 'button',
        label: 'Next →',
        variant: 'primary',
        group: 'right',
        action: 'security-next',
        disabledWhen: (state) => !state.selectedRole,
      },
    ],
  },
  'admin-overview': {
    id: 'admin-overview',
    createSlide: ({ licenseNotice }) => PlanOverviewSlide({ isAdmin: true, licenseNotice }),
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
        label: 'Show me around',
        variant: 'primary',
        group: 'right',
        action: 'launch-admin',
      },
      {
        key: 'admin-skip',
        type: 'button',
        label: 'Skip the tour',
        variant: 'secondary',
        group: 'left',
        action: 'skip-to-license',
      },
    ],
  },
  'server-license': {
    id: 'server-license',
    createSlide: ({ licenseNotice }) => ServerLicenseSlide({ licenseNotice }),
    hero: { type: 'logo' },
    buttons: [
      {
        key: 'license-close',
        type: 'button',
        label: 'Skip for now',
        variant: 'secondary',
        group: 'left',
        action: 'close',
      },
      {
        key: 'license-see-plans',
        type: 'button',
        label: 'See Plans →',
        variant: 'primary',
        group: 'right',
        action: 'see-plans',
      },
    ],
  },
};

export const FLOW_SEQUENCES = {
  loginAdmin: ['welcome', 'desktop-install', 'admin-overview'] as SlideId[],
  loginUser: ['welcome', 'desktop-install'] as SlideId[],
  noLoginBase: ['welcome', 'desktop-install', 'security-check'] as SlideId[],
  noLoginAdmin: ['admin-overview'] as SlideId[],
};


