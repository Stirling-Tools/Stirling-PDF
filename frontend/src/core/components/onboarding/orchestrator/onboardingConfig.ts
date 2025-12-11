export type OnboardingStepId =
  | 'first-login'
  | 'welcome'
  | 'desktop-install'
  | 'security-check'
  | 'admin-overview'
  | 'tool-layout'
  | 'tour-overview'
  | 'server-license'
  | 'analytics-choice';

export type OnboardingStepType =
  | 'modal-slide'
  | 'tool-prompt'
  | 'analytics-modal';

export interface OnboardingRuntimeState {
  selectedRole: 'admin' | 'user' | null;
  tourRequested: boolean;
  tourType: 'admin' | 'tools' | 'whatsnew';
  isDesktopApp: boolean;
  desktopSlideDisabled: boolean;
  analyticsNotConfigured: boolean;
  analyticsEnabled: boolean;
  licenseNotice: {
    totalUsers: number | null;
    freeTierLimit: number;
    isOverLimit: boolean;
    requiresLicense: boolean;
  };
  requiresPasswordChange: boolean;
  firstLoginUsername: string;
  usingDefaultCredentials: boolean;
}

export interface OnboardingConditionContext extends OnboardingRuntimeState {
  loginEnabled: boolean;
  effectiveIsAdmin: boolean;
}

export interface OnboardingStep {
  id: OnboardingStepId;
  type: OnboardingStepType;
  condition: (ctx: OnboardingConditionContext) => boolean;
  slideId?: 'first-login' | 'welcome' | 'desktop-install' | 'security-check' | 'admin-overview' | 'server-license' | 'tour-overview' | 'analytics-choice';
}

export const DEFAULT_RUNTIME_STATE: OnboardingRuntimeState = {
  selectedRole: null,
  tourRequested: false,
  tourType: 'whatsnew',
  isDesktopApp: false,
  analyticsNotConfigured: false,
  analyticsEnabled: false,
  licenseNotice: {
    totalUsers: null,
    freeTierLimit: 5,
    isOverLimit: false,
    requiresLicense: false,
  },
  requiresPasswordChange: false,
  firstLoginUsername: '',
  usingDefaultCredentials: false,
  desktopSlideDisabled: false,
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'first-login',
    type: 'modal-slide',
    slideId: 'first-login',
    condition: (ctx) => ctx.requiresPasswordChange,
  },
  {
    id: 'analytics-choice',
    type: 'modal-slide',
    slideId: 'analytics-choice',
    condition: (ctx) => ctx.effectiveIsAdmin && ctx.analyticsNotConfigured,
  },
  {
    id: 'welcome',
    type: 'modal-slide',
    slideId: 'welcome',
    condition: () => true,
  },
  {
    id: 'desktop-install',
    type: 'modal-slide',
    slideId: 'desktop-install',
    condition: (ctx) => !ctx.isDesktopApp && !ctx.desktopSlideDisabled,
  },
  {
    id: 'security-check',
    type: 'modal-slide',
    slideId: 'security-check',
    // condition: (ctx) => !ctx.loginEnabled && !ctx.isDesktopApp,
    condition: () => false,
  },
  {
    id: 'admin-overview',
    type: 'modal-slide',
    slideId: 'admin-overview',
    condition: (ctx) => ctx.effectiveIsAdmin,
  },
  {
    id: 'tool-layout',
    type: 'tool-prompt',
    // condition: () => true,
    condition: () => false,
  },
  {
    id: 'tour-overview',
    type: 'modal-slide',
    slideId: 'tour-overview',
    condition: (ctx) => !ctx.effectiveIsAdmin && ctx.tourType !== 'admin',
  },
  {
    id: 'server-license',
    type: 'modal-slide',
    slideId: 'server-license',
    condition: (ctx) => ctx.effectiveIsAdmin && ctx.licenseNotice.requiresLicense,
  },
];

export function getStepById(id: OnboardingStepId): OnboardingStep | undefined {
  return ONBOARDING_STEPS.find((step) => step.id === id);
}

export function getStepIndex(id: OnboardingStepId): number {
  return ONBOARDING_STEPS.findIndex((step) => step.id === id);
}

