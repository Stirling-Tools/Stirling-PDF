import { SlideId } from "@app/components/onboarding/saasOnboardingFlowConfig";

export interface SaasFlowInputs {
  /** Free-tier wallet with one-time allowance remaining — show the usage meter. */
  showUsageSlide: boolean;
  /** Team leaders only — invited members and anonymous guests skip the team slide. */
  showTeamSlide: boolean;
}

/**
 * Resolves the SaaS onboarding slide sequence. The free-editor pitch and
 * desktop install bookend the flow; the usage meter and team slides slot in
 * when their conditions hold.
 */
export function resolveSaasFlow({
  showUsageSlide,
  showTeamSlide,
}: SaasFlowInputs): SlideId[] {
  return [
    "free-editor",
    ...(showUsageSlide ? (["usage"] as const) : []),
    ...(showTeamSlide ? (["team"] as const) : []),
    "desktop-install",
  ];
}
