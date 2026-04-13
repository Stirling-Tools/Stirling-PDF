/**
 * CustomEvent name for opening the desktop sign-in modal (SetupWizard).
 * Kept in a leaf module so apiClientSetup and others avoid importing SignInModal (heavy graph).
 */
export const OPEN_SIGN_IN_EVENT = "stirling:open-sign-in";
