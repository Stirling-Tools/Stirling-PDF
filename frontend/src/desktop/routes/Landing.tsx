import HomePage from "@app/pages/HomePage";

/**
 * Desktop override of Landing.
 * In desktop builds, authentication is managed entirely by AppProviders,
 * the DesktopOnboardingModal, and the SignInModal — never by routing to /login.
 * Always render the main app; the onboarding/sign-in modals appear on top
 * when authentication is required.
 */
export default function Landing() {
  return <HomePage />;
}
