/**
 * Desktop bootstrap for the SaaS product onboarding.
 *
 * First-load auto-display is disabled: the shared cloud {@link SaasOnboardingModal}
 * no longer appears automatically on first sign-in. This mirrors the web SaaS
 * {@code OnboardingBootstrap}, which no longer auto-opens either. The modal
 * component is retained for explicit/manual triggering; nothing opens it here.
 *
 * The props signature is preserved so the AppProviders wiring is unaffected.
 */
interface DesktopSaasOnboardingBootstrapProps {
  connectionMode: "saas" | "selfhosted" | "local" | null;
}

export function DesktopSaasOnboardingBootstrap(
  _props: DesktopSaasOnboardingBootstrapProps,
) {
  return null;
}
