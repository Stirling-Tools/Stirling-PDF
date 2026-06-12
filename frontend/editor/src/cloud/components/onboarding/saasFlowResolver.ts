import { SlideId } from "@app/components/onboarding/saasOnboardingFlowConfig";

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

/**
 * Resolves the SaaS onboarding slide sequence. The free-editor pitch and
 * desktop install bookend the flow; the usage meter and team slides slot in
 * when their conditions hold. When {@link SaasFlowInputs.hideDesktopInstall} is
 * set, the closing desktop-install slide is dropped (used by the desktop app,
 * which has no reason to pitch its own download).
 */
export function resolveSaasFlow({
  showUsageSlide,
  showTeamSlide,
  hideDesktopInstall = false,
}: SaasFlowInputs): SlideId[] {
  return [
    "free-editor",
    ...(showUsageSlide ? (["usage"] as const) : []),
    ...(showTeamSlide ? (["team"] as const) : []),
    ...(hideDesktopInstall ? [] : (["desktop-install"] as const)),
  ];
}
