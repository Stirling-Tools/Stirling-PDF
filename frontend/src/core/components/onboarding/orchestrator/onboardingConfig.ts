/**
 * Onboarding Configuration
 * 
 * Defines all onboarding steps and their conditions.
 * Each step has:
 * - id: Unique identifier
 * - condition: Function that determines if the step should be shown
 * - type: The type of step for rendering purposes
 */

import type { ServerExperienceValue } from '@core/hooks/useServerExperience';

export type OnboardingStepId =
  | 'first-login'
  | 'welcome'
  | 'desktop-install'
  | 'security-check'
  | 'admin-overview'
  | 'tool-layout'
  | 'tour'
  | 'server-license'
  | 'cookie-consent'
  | 'analytics-choice';

export type OnboardingStepType =
  | 'modal-slide'
  | 'tool-prompt'
  | 'tour'
  | 'cookie-consent'
  | 'analytics-modal';

/**
 * Runtime state that affects step conditions.
 * This state is accumulated as the user progresses through onboarding.
 */
export interface OnboardingRuntimeState {
  /** Role selected in security check (when login is disabled) */
  selectedRole: 'admin' | 'user' | null;
  /** Whether user accepted tour from admin-overview or auto-launch for users */
  tourRequested: boolean;
  /** Type of tour to show */
  tourType: 'admin' | 'tools';
  /** Whether we're running in the desktop app (Tauri) */
  isDesktopApp: boolean;
  /** Whether analytics config needs admin decision */
  analyticsNotConfigured: boolean;
  /** Whether cookie consent has been responded to */
  cookieConsentResponded: boolean;
  /** Whether analytics is enabled on the server */
  analyticsEnabled: boolean;
  /** License notice for server license step */
  licenseNotice: {
    totalUsers: number | null;
    freeTierLimit: number;
    isOverLimit: boolean;
    requiresLicense: boolean;
  };
  /** Whether user needs to change password on first login */
  requiresPasswordChange: boolean;
  /** Username for first login password change */
  firstLoginUsername: string;
  /** Whether user is using default credentials (admin/stirling) - can auto-fill current password */
  usingDefaultCredentials: boolean;
}

/**
 * Context passed to step condition functions
 */
export interface OnboardingConditionContext extends ServerExperienceValue, OnboardingRuntimeState {}

export interface OnboardingStep {
  id: OnboardingStepId;
  type: OnboardingStepType;
  /** 
   * Condition function that determines if this step should be shown.
   * Returns true if the step should be included in the user's flow.
   */
  condition: (ctx: OnboardingConditionContext) => boolean;
  /**
   * For modal-slide type, specifies which slide to render.
   * This matches the SlideId from onboardingFlowConfig.
   */
  slideId?: 'first-login' | 'welcome' | 'desktop-install' | 'security-check' | 'admin-overview' | 'server-license';
}

/**
 * Default runtime state for onboarding
 */
export const DEFAULT_RUNTIME_STATE: OnboardingRuntimeState = {
  selectedRole: null,
  tourRequested: false,
  tourType: 'tools',
  isDesktopApp: false,
  analyticsNotConfigured: false,
  cookieConsentResponded: false,
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
};

/**
 * All onboarding steps in order of appearance.
 * The order here determines the flow sequence.
 * 
 * Steps are filtered based on their conditions.
 */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  // ============================================
  // PHASE 0: First Login Password Change (if required)
  // ============================================
  {
    id: 'first-login',
    type: 'modal-slide',
    slideId: 'first-login',
    // Show when user needs to change password on first login
    condition: (ctx) => ctx.requiresPasswordChange,
  },

  // ============================================
  // PHASE 1: Initial Modal Slides
  // ============================================
  {
    id: 'welcome',
    type: 'modal-slide',
    slideId: 'welcome',
    condition: () => true, // Always show welcome as first step
  },
  {
    id: 'desktop-install',
    type: 'modal-slide',
    slideId: 'desktop-install',
    // Only show if not running as desktop app
    // This is handled by the desktop override - on desktop, this step is excluded
    condition: (ctx) => !ctx.isDesktopApp,
  },
  {
    id: 'security-check',
    type: 'modal-slide',
    slideId: 'security-check',
    // Only show when login is disabled AND not on desktop app
    // (desktop app handles role detection differently)
    condition: (ctx) => !ctx.loginEnabled && !ctx.isDesktopApp,
  },
  {
    id: 'admin-overview',
    type: 'modal-slide',
    slideId: 'admin-overview',
    // Show for admins (either known from login or self-reported)
    condition: (ctx) => ctx.effectiveIsAdmin,
  },

  // ============================================
  // PHASE 2: Tool Layout Selection
  // ============================================
  {
    id: 'tool-layout',
    type: 'tool-prompt',
    // Always show tool layout prompt after initial slides
    condition: () => true,
  },

  // ============================================
  // PHASE 3: Interactive Tour
  // ============================================
  {
    id: 'tour',
    type: 'tour',
    // Show tour if:
    // 1. Admin explicitly requested it (clicked "Show me around"), OR
    // 2. User is NOT an admin (non-admins always get the tools tour)
    condition: (ctx) => ctx.tourRequested || !ctx.effectiveIsAdmin,
  },

  // ============================================
  // PHASE 4: Server License (Admins Only)
  // ============================================
  {
    id: 'server-license',
    type: 'modal-slide',
    slideId: 'server-license',
    // Show for admins when license is required (over limit or approaching)
    condition: (ctx) => ctx.effectiveIsAdmin && ctx.licenseNotice.requiresLicense,
  },

  // ============================================
  // PHASE 5: Analytics Choice (Admins Only)
  // Must come BEFORE cookie consent - admin needs to decide on analytics first
  // ============================================
  {
    id: 'analytics-choice',
    type: 'analytics-modal',
    // Show for admins when analytics config is null (needs decision)
    condition: (ctx) => ctx.effectiveIsAdmin && ctx.analyticsNotConfigured,
  },

  // ============================================
  // PHASE 6: Cookie Consent
  // ============================================
  {
    id: 'cookie-consent',
    type: 'cookie-consent',
    // Show if analytics is explicitly enabled (not null) and user hasn't responded yet
    condition: (ctx) => ctx.analyticsEnabled && !ctx.analyticsNotConfigured && !ctx.cookieConsentResponded,
  },
];

/**
 * Get a step by ID
 */
export function getStepById(id: OnboardingStepId): OnboardingStep | undefined {
  return ONBOARDING_STEPS.find((step) => step.id === id);
}

/**
 * Get the index of a step by ID
 */
export function getStepIndex(id: OnboardingStepId): number {
  return ONBOARDING_STEPS.findIndex((step) => step.id === id);
}

