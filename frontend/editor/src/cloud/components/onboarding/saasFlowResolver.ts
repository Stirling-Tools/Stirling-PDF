import { SlideId } from "@app/components/onboarding/saasOnboardingFlowConfig";
import {
  resolveFlowIds,
  type FlowStep,
} from "@app/components/onboarding/onboardingSlideTypes";

export interface SaasFlowInputs {
  /** Free-tier wallet with one-time allowance remaining — show the usage meter. */
  showUsageSlide: boolean;
  /** Team leaders only — invited members and anonymous guests skip the team slide. */
  showTeamSlide: boolean;
  /**
   * Drop the closing "desktop-install" slide. The web (saas) flow pitches the
   * desktop download, but the desktop app reuses this same flow and is already
   * the desktop app, so it omits that slide. Defaults to false (slide shown).
   */
  hideDesktopInstall?: boolean;
}

// The SaaS flow as data: free-editor and desktop-install bookend it; the usage
// meter and team slides slot in when their conditions hold. This is the same
// "flow = the steps that apply, in order" shape the core flow uses, resolved
// through the shared {@link resolveFlowIds} helper.
const SAAS_FLOW: FlowStep<SlideId, SaasFlowInputs>[] = [
  { id: "free-editor", when: () => true },
  { id: "usage", when: (input) => input.showUsageSlide },
  { id: "team", when: (input) => input.showTeamSlide },
  { id: "desktop-install", when: (input) => !input.hideDesktopInstall },
];

/**
 * Resolves the SaaS onboarding slide sequence. When
 * {@link SaasFlowInputs.hideDesktopInstall} is set, the closing desktop-install
 * slide is dropped (used by the desktop app, which has no reason to pitch its
 * own download).
 */
export function resolveSaasFlow(inputs: SaasFlowInputs): SlideId[] {
  return resolveFlowIds(SAAS_FLOW, inputs);
}
