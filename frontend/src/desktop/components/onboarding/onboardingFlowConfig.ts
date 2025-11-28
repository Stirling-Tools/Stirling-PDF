/**
 * Desktop override of onboarding flow config.
 * 
 * This version removes the desktop-install and security-check slides
 * since they're not relevant when running as a desktop app.
 * 
 * The SlideId type still includes all values for type compatibility,
 * but the actual FLOW_SEQUENCES don't use these slides.
 */

import WelcomeSlide from '@app/components/onboarding/slides/WelcomeSlide';
import PlanOverviewSlide from '@app/components/onboarding/slides/PlanOverviewSlide';
import ServerLicenseSlide from '@app/components/onboarding/slides/ServerLicenseSlide';
import { SlideConfig, LicenseNotice } from '@app/types/types';

// Keep the full type for compatibility, but these slides won't be used
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
  loginEnabled?: boolean;
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
        label: 'onboarding.buttons.next',
        variant: 'primary',
        group: 'right',
        action: 'next',
      },
    ],
  },
  // Stub definitions for desktop-install and security-check - not used on desktop
  // but kept for type compatibility with core code
  'desktop-install': {
    id: 'desktop-install',
    createSlide: () => WelcomeSlide(), // Placeholder - never used
    hero: { type: 'dual-icon' },
    buttons: [],
  },
  'security-check': {
    id: 'security-check',
    createSlide: () => WelcomeSlide(), // Placeholder - never used
    hero: { type: 'shield' },
    buttons: [],
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
};

/**
 * Desktop flow sequences - simplified without desktop-install and security-check slides
 * since users are already on desktop and security check is not needed.
 */
export const FLOW_SEQUENCES = {
  loginAdmin: ['welcome', 'admin-overview'] as SlideId[],
  loginUser: ['welcome'] as SlideId[],
  noLoginBase: ['welcome'] as SlideId[],
  noLoginAdmin: ['admin-overview'] as SlideId[],
};

