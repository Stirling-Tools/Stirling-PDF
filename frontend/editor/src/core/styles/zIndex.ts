// Centralized z-index constants for new usages added in this branch.
// Keep values identical to their original inline usages.

export const Z_INDEX_FULLSCREEN_SURFACE = 1000;
export const Z_INDEX_OVER_FULLSCREEN_SURFACE = 1300;
export const Z_ANALYTICS_MODAL = 1301;
// Config/Settings modal - should appear above analytics modal when navigating from onboarding
export const Z_INDEX_CONFIG_MODAL = 1400;
// Modal layered directly over the settings/config modal (e.g. the Stripe
// checkout modal). Consumed by the shared cloud/ checkout component, so it
// lives in the core base both the saas and cloud cascades resolve.
// Must be strictly ABOVE the config modal (1400); 1450 is taken by the cookie
// preferences modal, so sit above the whole settings cluster (below 2000).
export const Z_INDEX_OVER_SETTINGS_MODAL = 1500;

export const Z_INDEX_FILE_MANAGER_MODAL = 1200;

// Chat FAB overlay — sits above normal app chrome (fullscreen surface: 1000)
// but below all modals (automate: 1100, file manager: 1200, config: 1400).
export const Z_INDEX_CHAT_FAB_OVERLAY = 1050;
export const Z_INDEX_OVER_FILE_MANAGER_MODAL = 1300;

export const Z_INDEX_AUTOMATE_MODAL = 1100;
// Dropdowns/Popovers inside automation modals need to be above the modal
export const Z_INDEX_AUTOMATE_DROPDOWN = 1150;

// page editor Zindexes
export const Z_INDEX_HOVER_ACTION_MENU = 100;
export const Z_INDEX_SELECTION_BOX = 1000;
export const Z_INDEX_DROP_INDICATOR = 1001;
export const Z_INDEX_DRAG_BADGE = 1001;
// Modal that appears on top of config modal (e.g., restart confirmation, update modal)
export const Z_INDEX_OVER_CONFIG_MODAL = 2000;

// Cookie-consent banner — above the chat FAB (1050), below all modals and onboarding; reaches CSS via --z-index-cookie-consent
export const Z_INDEX_COOKIE_CONSENT_BANNER = 1060;
// Cookie-consent preferences dialog — above the config modal it opens from; reaches CSS via --z-index-cookie-preferences
export const Z_INDEX_COOKIE_PREFERENCES_MODAL = 1450;

// Sign-in modal — must appear above all app UI including config and analytics modals
export const Z_INDEX_SIGN_IN_MODAL = 9000;

// Floating viewer menus rendered through document.body portals.
export const Z_INDEX_VIEWER_FLOATING_MENU = 10000;

export const Z_INDEX_TOAST = 10001;

// Signature preview overlays inside the PDF viewer
export const Z_INDEX_SIGNATURE_DRAG_BLOCKER = 999;
export const Z_INDEX_SIGNATURE_OVERLAY = 1000;
export const Z_INDEX_SIGNATURE_OVERLAY_HANDLE = 1001;
export const Z_INDEX_SIGNATURE_OVERLAY_DELETE = 1002;
